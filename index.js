'use strict'

const fe = require('fastify-error')
const fp = require('fastify-plugin')
const assert = require('assert')
const { monitorEventLoopDelay } = require('perf_hooks')
const { eventLoopUtilization } = require('perf_hooks').performance

const SERVICE_UNAVAILABLE = 503
const createError = (msg = 'Service Unavailable') => fe('FST_UNDER_PRESSURE', msg, SERVICE_UNAVAILABLE)

function getSampleInterval (value, eventLoopResolution) {
  const defaultValue = monitorEventLoopDelay ? 1000 : 5
  const sampleInterval = value || defaultValue
  return monitorEventLoopDelay ? Math.max(eventLoopResolution, sampleInterval) : sampleInterval
}

const isUnderPressureError = Symbol('isUnderPressureError')

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

  const timer = setInterval(updateMemoryUsage, sampleInterval)
  timer.unref()

  let externalsHealthy = false
  let externalHealthCheckTimer
  if (healthCheck) {
    assert(typeof healthCheck === 'function', 'opts.healthCheck should be a function that returns a promise that resolves to true or false')
    assert(healthCheckInterval > 0 || opts.exposeStatusRoute, 'opts.healthCheck requires opts.healthCheckInterval or opts.exposeStatusRoute')

    const doCheck = async () => {
      try {
        externalsHealthy = await healthCheck()
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

  fastify.decorate('memoryUsage', memoryUsage)
  fastify.decorate(isUnderPressureError, false)
  fastify.addHook('onClose', onClose)

  opts.exposeStatusRoute = mapExposeStatusRoute(opts.exposeStatusRoute, '/status')
  opts.exposeStatusDetailsRoute = mapExposeStatusRoute(opts.exposeStatusDetailsRoute, '/status/details')

  if (opts.exposeStatusRoute) {
    fastify.route({
      ...opts.exposeStatusRoute.routeOpts || {},
      url: opts.exposeStatusRoute.url,
      method: 'GET',
      schema: Object.assign({}, opts.exposeStatusRoute.routeSchemaOpts, {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' }
            }
          }
        }
      }),
      handler: onStatus
    })
  }

  if (opts.exposeStatusDetailsRoute) {
    fastify.route({
      ...opts.exposeStatusDetailsRoute.routeOpts || {},
      url: opts.exposeStatusDetailsRoute.url,
      method: 'GET',
      schema: Object.assign({}, opts.exposeStatusDetailsRoute.routeSchemaOpts, {
        response: {
          200: {
            type: 'object',
            properties: {
              eventLoopDelay: { type: 'number' },
              eventLoopUtilized: { type: 'number' },
              heapUsed: { type: 'number' },
              rssBytes: { type: 'number' }
            }
          }
        }
      }),
      handler: onStatusDetails
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

  function mapExposeStatusRoute (opts, defaultUrl) {
    if (!opts) {
      return false
    }
    if (typeof opts === 'string') {
      return { url: opts }
    }
    return Object.assign({ url: defaultUrl }, opts)
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
      req[isUnderPressureError] = true
    }

    if (checkMaxHeapUsedBytes && heapUsed > maxHeapUsedBytes) {
      req[isUnderPressureError] = true
    }

    if (checkMaxRssBytes && rssBytes > maxRssBytes) {
      req[isUnderPressureError] = true
    }

    if (!externalsHealthy) {
      req[isUnderPressureError] = true
    }

    if (checkMaxEventLoopUtilization && eventLoopUtilized > maxEventLoopUtilization) {
      req[isUnderPressureError] = true
    }

    if (
      [
        opts.exposeStatusRoute.url,
        opts.exposeStatusDetailsRoute.url
      ].includes(req.url)
    ) {
      return next()
    }

    if (req[isUnderPressureError]) {
      sendError(reply, next)
    } else {
      next()
    }
  }

  function sendError (reply, next) {
    reply.status(SERVICE_UNAVAILABLE).header('Retry-After', retryAfter)
    next(underPressureError)
  }

  function memoryUsage () {
    return {
      eventLoopDelay,
      eventLoopUtilized,
      heapUsed,
      rssBytes
    }
  }

  async function onStatus (req, reply) {
    if (healthCheck) {
      try {
        if (!await healthCheck()) {
          req.log.error('external health check failed')
          reply.status(SERVICE_UNAVAILABLE).header('Retry-After', retryAfter)
          throw underPressureError
        }
      } catch (err) {
        req.log.error({ err }, 'external health check failed with error')
        reply.status(SERVICE_UNAVAILABLE).header('Retry-After', retryAfter)
        throw underPressureError
      }
    }
    if (req[isUnderPressureError]) {
      return { status: 'not-ok' }
    }
    return { status: 'ok' }
  }

  function onStatusDetails () {
    return memoryUsage()
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
