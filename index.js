'use strict'

const fp = require('fastify-plugin')
const assert = require('assert')

function underPressure (fastify, opts, next) {
  opts = opts || {}

  const sampleInterval = opts.sampleInterval || 5
  const maxEventLoopDelay = opts.maxEventLoopDelay || 0
  const maxHeapUsedBytes = opts.maxHeapUsedBytes || 0
  const maxRssBytes = opts.maxRssBytes || 0
  const healthCheck = opts.healthCheck || false
  const healthCheckInterval = opts.healthCheckInterval || 1000

  const checkMaxEventLoopDelay = maxEventLoopDelay > 0
  const checkMaxHeapUsedBytes = maxHeapUsedBytes > 0
  const checkMaxRssBytes = maxRssBytes > 0

  var heapUsed = 0
  var rssBytes = 0
  var eventLoopDelay = 0
  var lastCheck = now()
  const timer = setInterval(updateMemoryUsage, sampleInterval)
  timer.unref()

  var externalsHealthy = false
  var externalHealthCheckTimer
  if (healthCheck) {
    assert(typeof healthCheck === 'function', 'opts.healthCheck should be a function that returns a promise that resolves to true or false')

    const doCheck = () => healthCheck()
      .then(externalHealth => { externalsHealthy = externalHealth })
      .catch((error) => {
        externalsHealthy = false
        fastify.log.error('external healthCheck function suupplied to `under-pressure` threw an error. setting the service status to unhealthy.', { error })
      })

    doCheck().then(() => next())

    externalHealthCheckTimer = setInterval(doCheck, healthCheckInterval)
    externalHealthCheckTimer.unref()
  } else {
    externalsHealthy = true
  }

  fastify.decorate('memoryUsage', memoryUsage)
  fastify.addHook('onClose', onClose)

  if (opts.exposeStatusRoute) {
    fastify.route({
      url: opts.exposeStatusRoute === true ? '/status' : opts.exposeStatusRoute,
      method: 'GET',
      schema: {
        response: { 200: {
          type: 'object',
          properties: {
            status: { type: 'string' }
          }
        } }
      },
      handler: onStatus
    })
  }

  if (checkMaxEventLoopDelay === false &&
    checkMaxHeapUsedBytes === false &&
    checkMaxRssBytes === false &&
    healthCheck === false) {
    return next()
  }

  const serviceUnavailableError = new Error(opts.message || 'Service Unavailable')
  const retryAfter = opts.retryAfter || 10

  fastify.addHook('onRequest', onRequest)

  function updateMemoryUsage () {
    var mem = process.memoryUsage()
    heapUsed = mem.heapUsed
    rssBytes = mem.rss
    var toCheck = now()
    eventLoopDelay = toCheck - lastCheck - sampleInterval
    lastCheck = toCheck
  }

  function onRequest (req, reply, next) {
    if (checkMaxEventLoopDelay && eventLoopDelay > maxEventLoopDelay) {
      sendError(reply, next)
      return
    }

    if (checkMaxHeapUsedBytes && heapUsed > maxHeapUsedBytes) {
      sendError(reply, next)
      return
    }

    if (checkMaxRssBytes && rssBytes > maxRssBytes) {
      sendError(reply, next)
      return
    }

    if (!externalsHealthy) {
      sendError(reply, next)
      return
    }

    next()
  }

  function sendError (reply, next) {
    reply.status(503).header('Retry-After', retryAfter)
    next(serviceUnavailableError)
  }

  function memoryUsage () {
    return {
      eventLoopDelay,
      rssBytes,
      heapUsed
    }
  }

  function onStatus (req, reply) {
    reply.send({ status: 'ok' })
  }

  function onClose (fastify, done) {
    clearInterval(timer)
    clearInterval(externalHealthCheckTimer)
    done()
  }

  // if there is no healthcheck then proceed
  // otherwise we need to wait for the initial healthcheck promise to resolve
  if (!healthCheck) next()
}

function now () {
  var ts = process.hrtime()
  return (ts[0] * 1e3) + (ts[1] / 1e6)
}

module.exports = fp(underPressure, {
  fastify: '>=2.0.0',
  name: 'under-pressure'
})
