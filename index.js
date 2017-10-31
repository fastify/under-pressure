'use strict'

const fp = require('fastify-plugin')
const Loopbench = require('loopbench')

function underPressure (fastify, opts, next) {
  opts = opts || {}
  opts.maxEventLoopDelay = opts.maxEventLoopDelay || {}

  const loopbench = Loopbench(opts.maxEventLoopDelay)
  const serviceUnavailableError = new Error(opts.maxEventLoopDelay.message || 'Service Unavailable')
  const retryAfter = opts.maxEventLoopDelay.retryAfter || 10

  fastify.decorate('loopbench', loopbench)
  fastify.addHook('onRequest', onRequest)
  fastify.addHook('onClose', onClose)

  function onRequest (req, res, next) {
    if (loopbench.overLimit) {
      res.statusCode = 503
      res.setHeader('Retry-After', retryAfter)
      next(serviceUnavailableError)
      return
    }
    next()
  }

  function onClose (fastify, done) {
    loopbench.stop()
    done()
  }

  next()
}

module.exports = fp(underPressure, '>=0.27.0')
