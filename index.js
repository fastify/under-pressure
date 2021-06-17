'use strict'

const fe = require('fastify-error')
const fp = require('fastify-plugin')
const assert = require('assert')
const { monitorEventLoopDelay } = require('perf_hooks')
const { eventLoopUtilization } = require('perf_hooks').performance

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

async function underPressure (fastify, opts) {
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

  const timer = setInterval(updateMemoryUsage, sampleInterval)
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
      externalHealthCheckTimer = setInterval(doCheck, healthCheckInterval)
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
            properties: Object.assign(
              { status: { type: 'string' } },
              opts.exposeStatusRoute.routeResponseSchemaOpts
            )
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

  function updateMemoryUsage () {
    const mem = process.memoryUsage()
    heapUsed = mem.heapUsed
    rssBytes = mem.rss
    updateEventLoopDelay()
    updateEventLoopUtilization()
  }

  function onRequest (req, reply, next) {
    if (checkMaxEventLoopDelay && eventLoopDelay > maxEventLoopDelay) {
      handlePressure(req, reply, next, TYPE_EVENT_LOOP_DELAY, eventLoopDelay)
      return
    }

    if (checkMaxHeapUsedBytes && heapUsed > maxHeapUsedBytes) {
      handlePressure(req, reply, next, TYPE_HEAP_USED_BYTES, heapUsed)
      return
    }

    if (checkMaxRssBytes && rssBytes > maxRssBytes) {
      handlePressure(req, reply, next, TYPE_RSS_BYTES, rssBytes)
      return
    }

    if (!externalsHealthy) {
      handlePressure(req, reply, next, TYPE_HEALTH_CHECK)
      return
    }

    if (checkMaxEventLoopUtilization && eventLoopUtilized > maxEventLoopUtilization) {
      handlePressure(req, reply, next, TYPE_EVENT_LOOP_UTILIZATION, eventLoopUtilized)
      return
    }

    next()
  }

  function handlePressure (req, reply, next, type, value) {
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
    clearInterval(timer)
    clearInterval(externalHealthCheckTimer)
    done()
  }
}

function now () {
  const ts = process.hrtime()
  return (ts[0] * 1e3) + (ts[1] / 1e6)
}

module.exports = fp(underPressure, {
  fastify: '3.x',
  name: 'under-pressure'
})

module.exports.TYPE_EVENT_LOOP_DELAY = TYPE_EVENT_LOOP_DELAY
module.exports.TYPE_EVENT_LOOP_UTILIZATION = TYPE_EVENT_LOOP_UTILIZATION
module.exports.TYPE_HEALTH_CHECK = TYPE_HEALTH_CHECK
module.exports.TYPE_HEAP_USED_BYTES = TYPE_HEAP_USED_BYTES
module.exports.TYPE_RSS_BYTES = TYPE_RSS_BYTES
