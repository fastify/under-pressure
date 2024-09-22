'use strict'

const fe = require('@fastify/error')
const fp = require('fastify-plugin')
const assert = require('node:assert')
const { monitorEventLoopDelay } = require('node:perf_hooks')
const { eventLoopUtilization } = require('node:perf_hooks').performance

const SERVICE_UNAVAILABLE = 503
const createError = (msg = 'Service Unavailable') => fe('FST_UNDER_PRESSURE', msg, SERVICE_UNAVAILABLE)

const TYPE_EVENT_LOOP_DELAY = 'eventLoopDelay'
const TYPE_HEAP_USED_BYTES = 'heapUsedBytes'
const TYPE_RSS_BYTES = 'rssBytes'
const TYPE_HEALTH_CHECK = 'healthCheck'
const TYPE_EVENT_LOOP_UTILIZATION = 'eventLoopUtilization'

function getSampleInterval (value, eventLoopResolution) {
  const defaultValue = monitorEventLoopDelay ? 1000 : 5
  const sampleInterval = value || defaultValue
  return monitorEventLoopDelay ? Math.max(eventLoopResolution, sampleInterval) : sampleInterval
}

async function fastifyUnderPressure (fastify, opts) {
  opts = opts || {}

  const resolution = 10
  const sampleInterval = getSampleInterval(opts.sampleInterval, resolution)
  const maxEventLoopDelay = opts.maxEventLoopDelay || 0
  const maxHeapUsedBytes = opts.maxHeapUsedBytes || 0
  const maxRssBytes = opts.maxRssBytes || 0
  const healthCheck = opts.healthCheck || false
  const healthCheckInterval = opts.healthCheckInterval || -1
  const UnderPressureError = opts.customError || createError(opts.message)
  const maxEventLoopUtilization = opts.maxEventLoopUtilization || 0
  const pressureHandler = opts.pressureHandler

  const checkMaxEventLoopDelay = maxEventLoopDelay > 0
  const checkMaxHeapUsedBytes = maxHeapUsedBytes > 0
  const checkMaxRssBytes = maxRssBytes > 0
  const checkMaxEventLoopUtilization = eventLoopUtilization ? maxEventLoopUtilization > 0 : false

  let heapUsed = 0
  let rssBytes = 0
  let eventLoopDelay = 0
  let lastCheck
  let histogram
  let elu
  let eventLoopUtilized = 0

  if (monitorEventLoopDelay) {
    histogram = monitorEventLoopDelay({ resolution })
    histogram.enable()
  } else {
    lastCheck = now()
  }

  if (eventLoopUtilization) {
    elu = eventLoopUtilization()
  }

  fastify.decorate('memoryUsage', memoryUsage)
  fastify.decorate('isUnderPressure', isUnderPressure)

  const timer = setTimeout(beginMemoryUsageUpdate, sampleInterval)
  timer.unref()

  let externalsHealthy = false
  let externalHealthCheckTimer
  if (healthCheck) {
    assert(typeof healthCheck === 'function', 'opts.healthCheck should be a function that returns a promise that resolves to true or false')
    assert(healthCheckInterval > 0 || opts.exposeStatusRoute, 'opts.healthCheck requires opts.healthCheckInterval or opts.exposeStatusRoute')

    const doCheck = async () => {
      try {
        externalsHealthy = await healthCheck(fastify)
      } catch (error) {
        externalsHealthy = false
        fastify.log.error({ error }, 'external healthCheck function supplied to `under-pressure` threw an error. setting the service status to unhealthy.')
      }
    }

    await doCheck()

    if (healthCheckInterval > 0) {
      const beginCheck = async () => {
        await doCheck()
        externalHealthCheckTimer.refresh()
      }

      externalHealthCheckTimer = setTimeout(beginCheck, healthCheckInterval)
      externalHealthCheckTimer.unref()
    }
  } else {
    externalsHealthy = true
  }

  fastify.addHook('onClose', onClose)

  opts.exposeStatusRoute = mapExposeStatusRoute(opts.exposeStatusRoute)

  if (opts.exposeStatusRoute) {
    fastify.route({
      ...opts.exposeStatusRoute.routeOpts,
      url: opts.exposeStatusRoute.url,
      method: 'GET',
      schema: Object.assign({}, opts.exposeStatusRoute.routeSchemaOpts, {
        response: {
          200: {
            type: 'object',
            description: 'Health Check Succeeded',
            properties: Object.assign(
              { status: { type: 'string' } },
              opts.exposeStatusRoute.routeResponseSchemaOpts
            ),
            example: {
              status: 'ok'
            }
          },
          500: {
            type: 'object',
            description: 'Error Performing Health Check',
            properties: {
              message: { type: 'string', description: 'Error message for failure during health check', example: 'Internal Server Error' },
              statusCode: { type: 'number', description: 'Code representing the error. Always matches the HTTP response code.', example: 500 }
            }
          },
          503: {
            type: 'object',
            description: 'Health Check Failed',
            properties: {
              code: { type: 'string', description: 'Error code associated with the failing check', example: 'FST_UNDER_PRESSURE' },
              error: { type: 'string', description: 'Error thrown during health check', example: 'Service Unavailable' },
              message: { type: 'string', description: 'Error message to explain health check failure', example: 'Service Unavailable' },
              statusCode: { type: 'number', description: 'Code representing the error. Always matches the HTTP response code.', example: 503 }
            }
          }
        }
      }),
      handler: onStatus
    })
  }

  if (checkMaxEventLoopUtilization === false && checkMaxEventLoopDelay === false &&
    checkMaxHeapUsedBytes === false &&
    checkMaxRssBytes === false &&
    healthCheck === false) {
    return
  }

  const underPressureError = new UnderPressureError()
  const retryAfter = opts.retryAfter || 10

  fastify.addHook('onRequest', onRequest)

  function mapExposeStatusRoute (opts) {
    if (!opts) {
      return false
    }
    if (typeof opts === 'string') {
      return { url: opts }
    }
    return Object.assign({ url: '/status' }, opts)
  }

  function updateEventLoopDelay () {
    if (histogram) {
      eventLoopDelay = Math.max(0, histogram.mean / 1e6 - resolution)
      if (Number.isNaN(eventLoopDelay)) eventLoopDelay = Infinity
      histogram.reset()
    } else {
      const toCheck = now()
      eventLoopDelay = Math.max(0, toCheck - lastCheck - sampleInterval)
      lastCheck = toCheck
    }
  }

  function updateEventLoopUtilization () {
    if (elu) {
      eventLoopUtilized = eventLoopUtilization(elu).utilization
    } else {
      eventLoopUtilized = 0
    }
  }

  function beginMemoryUsageUpdate () {
    updateMemoryUsage()
    timer.refresh()
  }

  function updateMemoryUsage () {
    const mem = process.memoryUsage()
    heapUsed = mem.heapUsed
    rssBytes = mem.rss
    updateEventLoopDelay()
    updateEventLoopUtilization()
  }

  function isUnderPressure () {
    if (checkMaxEventLoopDelay && eventLoopDelay > maxEventLoopDelay) {
      return true
    }

    if (checkMaxHeapUsedBytes && heapUsed > maxHeapUsedBytes) {
      return true
    }

    if (checkMaxRssBytes && rssBytes > maxRssBytes) {
      return true
    }

    if (!externalsHealthy) {
      return true
    }

    if (checkMaxEventLoopUtilization && eventLoopUtilized > maxEventLoopUtilization) {
      return true
    }

    return false
  }

  function onRequest (req, reply, next) {
    const config = req.routeOptions?.config ?? req.context.config
    const _pressureHandler = config.pressureHandler || pressureHandler
    if (checkMaxEventLoopDelay && eventLoopDelay > maxEventLoopDelay) {
      handlePressure(_pressureHandler, req, reply, next, TYPE_EVENT_LOOP_DELAY, eventLoopDelay)
      return
    }

    if (checkMaxHeapUsedBytes && heapUsed > maxHeapUsedBytes) {
      handlePressure(_pressureHandler, req, reply, next, TYPE_HEAP_USED_BYTES, heapUsed)
      return
    }

    if (checkMaxRssBytes && rssBytes > maxRssBytes) {
      handlePressure(_pressureHandler, req, reply, next, TYPE_RSS_BYTES, rssBytes)
      return
    }

    if (!externalsHealthy) {
      handlePressure(_pressureHandler, req, reply, next, TYPE_HEALTH_CHECK, undefined)
      return
    }

    if (checkMaxEventLoopUtilization && eventLoopUtilized > maxEventLoopUtilization) {
      handlePressure(_pressureHandler, req, reply, next, TYPE_EVENT_LOOP_UTILIZATION, eventLoopUtilized)
      return
    }

    next()
  }

  function handlePressure (pressureHandler, req, reply, next, type, value) {
    if (typeof pressureHandler === 'function') {
      const result = pressureHandler(req, reply, type, value)
      if (result instanceof Promise) {
        result.then(() => next(), next)
      } else if (result == null) {
        next()
      } else {
        reply.send(result)
      }
    } else {
      reply.status(SERVICE_UNAVAILABLE).header('Retry-After', retryAfter)
      next(underPressureError)
    }
  }

  function memoryUsage () {
    return {
      eventLoopDelay,
      rssBytes,
      heapUsed,
      eventLoopUtilized
    }
  }

  async function onStatus (req, reply) {
    const okResponse = { status: 'ok' }
    if (healthCheck) {
      try {
        const checkResult = await healthCheck(fastify)
        if (!checkResult) {
          req.log.error('external health check failed')
          reply.status(SERVICE_UNAVAILABLE).header('Retry-After', retryAfter)
          throw underPressureError
        }

        return Object.assign(okResponse, checkResult)
      } catch (err) {
        req.log.error({ err }, 'external health check failed with error')
        reply.status(SERVICE_UNAVAILABLE).header('Retry-After', retryAfter)
        throw underPressureError
      }
    }

    return okResponse
  }

  function onClose (fastify, done) {
    clearTimeout(timer)
    clearTimeout(externalHealthCheckTimer)
    done()
  }
}

function now () {
  const ts = process.hrtime()
  return (ts[0] * 1e3) + (ts[1] / 1e6)
}

module.exports = fp(fastifyUnderPressure, {
  fastify: '4.x',
  name: '@fastify/under-pressure'
})
module.exports.default = fastifyUnderPressure
module.exports.fastifyUnderPressure = fastifyUnderPressure

module.exports.TYPE_EVENT_LOOP_DELAY = TYPE_EVENT_LOOP_DELAY
module.exports.TYPE_EVENT_LOOP_UTILIZATION = TYPE_EVENT_LOOP_UTILIZATION
module.exports.TYPE_HEALTH_CHECK = TYPE_HEALTH_CHECK
module.exports.TYPE_HEAP_USED_BYTES = TYPE_HEAP_USED_BYTES
module.exports.TYPE_RSS_BYTES = TYPE_RSS_BYTES
