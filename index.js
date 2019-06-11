'use strict'

const fp = require('fastify-plugin')
const assert = require('assert')

function underPressure (fastify, opts, next) {
  opts = opts || {}

  const sampleInterval = opts.sampleInterval || 5
  const maxEventLoopDelay = opts.maxEventLoopDelay || 0
  const maxHeapUsedBytes = opts.maxHeapUsedBytes || 0
  const maxRssBytes = opts.maxRssBytes || 0
  const healthCheck = opts.healthCheck || async function () { return true }
  const healthCheckInterval = opts.healthCheckInterval || 1000

  assert(typeof healthCheck === 'function', 'opts.healthCheck should be a function that returns a promise that resolves to true or false')

  const checkMaxEventLoopDelay = maxEventLoopDelay > 0
  const checkMaxHeapUsedBytes = maxHeapUsedBytes > 0
  const checkMaxRssBytes = maxRssBytes > 0

  var heapUsed = 0
  var rssBytes = 0
  var eventLoopDelay = 0
  var lastCheck = now()
  const timer = setInterval(updateMemoryUsage, sampleInterval)

  var externalsHealthy = false
  const doCheck = () => healthCheck().then(externalHealth => { externalsHealthy = externalHealth })
  doCheck()
  const externalHealthCheckTimer = setInterval(doCheck, healthCheckInterval)

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
      checkMaxRssBytes === false) {
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

  next()
}

function now () {
  var ts = process.hrtime()
  return (ts[0] * 1e3) + (ts[1] / 1e6)
}

module.exports = fp(underPressure, {
  fastify: '>=2.0.0',
  name: 'under-pressure'
})
