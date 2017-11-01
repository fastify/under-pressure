'use strict'

const fp = require('fastify-plugin')

function underPressure (fastify, opts, next) {
  opts = opts || {}

  const sampleInterval = opts.sampleInterval || 5
  const maxEventLoopDelay = opts.maxEventLoopDelay || 0
  const maxHeapUsedBytes = opts.maxHeapUsedBytes || 0
  const maxRssBytes = opts.maxRssBytes || 0

  const checkMaxEventLoopDelay = maxEventLoopDelay > 0
  const checkMaxHeapUsedBytes = maxHeapUsedBytes > 0
  const checkMaxRssBytes = maxRssBytes > 0

  var heapUsed = 0
  var rssBytes = 0
  var eventLoopDelay = 0
  var lastCheck = now()
  const timer = setInterval(updateMemoryUsage, sampleInterval)

  fastify.decorate('memoryUsage', memoryUsage)
  fastify.addHook('onClose', onClose)

  if (opts.exposeStatusRoute === true) {
    fastify.route({
      url: '/status',
      method: 'GET',
      schema: {
        response: { 200: {
          type: 'object',
          properties: {
            status: { type: 'string' }
          }}
        }
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

  function onRequest (req, res, next) {
    if (checkMaxEventLoopDelay && eventLoopDelay > maxEventLoopDelay) {
      sendError(res, next)
      return
    }

    if (checkMaxHeapUsedBytes && heapUsed > maxHeapUsedBytes) {
      sendError(res, next)
      return
    }

    if (checkMaxRssBytes && rssBytes > maxRssBytes) {
      sendError(res, next)
      return
    }

    next()
  }

  function sendError (res, next) {
    res.statusCode = 503
    res.setHeader('Retry-After', retryAfter)
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
    done()
  }

  next()
}

function now () {
  var ts = process.hrtime()
  return (ts[0] * 1e3) + (ts[1] / 1e6)
}

module.exports = fp(underPressure, '>=0.27.0')
