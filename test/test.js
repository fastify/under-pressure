'use strict'

const { test } = require('tap')
const { promisify } = require('node:util')
const forkRequest = require('./forkRequest')
const Fastify = require('fastify')
const { monitorEventLoopDelay } = require('node:perf_hooks')
const underPressure = require('../index')
const { valid, satisfies, coerce } = require('semver')

const wait = promisify(setTimeout)

test('Should return 503 on maxEventLoopDelay', t => {
  t.plan(6)

  const fastify = Fastify()
  fastify.register(underPressure, {
    maxEventLoopDelay: 15
  })

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0 }, async (err, address) => {
    t.error(err)
    fastify.server.unref()

    // If using monitorEventLoopDelay give it time to collect
    // some samples
    if (monitorEventLoopDelay) {
      await wait(500)
    }

    forkRequest(address, 500, (err, response, body) => {
      t.error(err)
      t.equal(response.statusCode, 503)
      t.equal(response.headers['retry-after'], '10')
      t.same(JSON.parse(body), {
        code: 'FST_UNDER_PRESSURE',
        error: 'Service Unavailable',
        message: 'Service Unavailable',
        statusCode: 503
      })
      t.equal(fastify.isUnderPressure(), true)
      fastify.close()
    })

    process.nextTick(() => block(1000))
  })
})

const isSupportedVersion = satisfies(valid(coerce(process.version)), '12.19.0 || >=14.0.0')
test('Should return 503 on maxEventloopUtilization', { skip: !isSupportedVersion }, t => {
  t.plan(6)
  const fastify = Fastify()
  fastify.register(underPressure, {
    maxEventLoopUtilization: 0.60
  })

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0 }, async (err, address) => {
    t.error(err)
    fastify.server.unref()

    forkRequest(address, 500, (err, response, body) => {
      t.error(err)
      t.equal(response.statusCode, 503)
      t.equal(response.headers['retry-after'], '10')
      t.same(JSON.parse(body), {
        code: 'FST_UNDER_PRESSURE',
        error: 'Service Unavailable',
        message: 'Service Unavailable',
        statusCode: 503
      })
      t.equal(fastify.isUnderPressure(), true)
      fastify.close()
    })

    process.nextTick(() => block(1000))
  })
})

test('Should return 503 on maxHeapUsedBytes', t => {
  t.plan(6)

  const fastify = Fastify()
  fastify.register(underPressure, {
    maxHeapUsedBytes: 1
  })

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    fastify.server.unref()

    forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, response, body) => {
      t.error(err)
      t.equal(response.statusCode, 503)
      t.equal(response.headers['retry-after'], '10')
      t.same(JSON.parse(body), {
        code: 'FST_UNDER_PRESSURE',
        error: 'Service Unavailable',
        message: 'Service Unavailable',
        statusCode: 503
      })
      t.equal(fastify.isUnderPressure(), true)
      fastify.close()
    })

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
  })
})

test('Should return 503 on maxRssBytes', t => {
  t.plan(6)

  const fastify = Fastify()
  fastify.register(underPressure, {
    maxRssBytes: 1
  })

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    fastify.server.unref()

    forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, response, body) => {
      t.error(err)
      t.equal(response.statusCode, 503)
      t.equal(response.headers['retry-after'], '10')
      t.same(JSON.parse(body), {
        code: 'FST_UNDER_PRESSURE',
        error: 'Service Unavailable',
        message: 'Service Unavailable',
        statusCode: 503
      })
      t.equal(fastify.isUnderPressure(), true)
      fastify.close()
    })

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
  })
})

test('Custom message and retry after header', t => {
  t.plan(5)

  const fastify = Fastify()
  fastify.register(underPressure, {
    maxRssBytes: 1,
    message: 'Under pressure!',
    retryAfter: 50
  })

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    fastify.server.unref()

    forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, response, body) => {
      t.error(err)
      t.equal(response.statusCode, 503)
      t.equal(response.headers['retry-after'], '50')
      t.same(JSON.parse(body), {
        code: 'FST_UNDER_PRESSURE',
        error: 'Service Unavailable',
        message: 'Under pressure!',
        statusCode: 503
      })
      fastify.close()
    })

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
  })
})

test('Custom error instance', t => {
  t.plan(5)

  class CustomError extends Error {
    constructor () {
      super('Custom error message')
      this.statusCode = 418
      this.code = 'FST_CUSTOM_ERROR'
      Error.captureStackTrace(this, CustomError)
    }
  }

  const fastify = Fastify()
  fastify.register(underPressure, {
    maxRssBytes: 1,
    customError: CustomError
  })

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.setErrorHandler((err, req, reply) => {
    t.ok(err instanceof Error)
    return reply.code(err.statusCode).send(err)
  })

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    fastify.server.unref()

    forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, response, body) => {
      t.error(err)
      t.equal(response.statusCode, 418)
      t.same(JSON.parse(body), {
        code: 'FST_CUSTOM_ERROR',
        error: 'I\'m a Teapot',
        message: 'Custom error message',
        statusCode: 418
      })
      fastify.close()
    })

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
  })
})

test('memoryUsage name space', t => {
  t.plan(10)

  const fastify = Fastify()
  fastify.register(underPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 100000000,
    maxRssBytes: 100000000,
    maxEventLoopUtilization: 0.85
  })

  fastify.get('/', (req, reply) => {
    t.ok(fastify.memoryUsage().eventLoopDelay > 0)
    t.ok(fastify.memoryUsage().heapUsed > 0)
    t.ok(fastify.memoryUsage().rssBytes > 0)
    t.ok(fastify.memoryUsage().eventLoopUtilized >= 0)
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0 }, async (err, address) => {
    t.error(err)
    t.equal(typeof fastify.memoryUsage, 'function')
    fastify.server.unref()

    // If using monitorEventLoopDelay give it time to collect
    // some samples
    if (monitorEventLoopDelay) {
      await wait(500)
    }

    forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, response, body) => {
      t.error(err)
      t.equal(response.statusCode, 200)
      t.same(JSON.parse(body), { hello: 'world' })
      t.equal(fastify.isUnderPressure(), true)
      fastify.close()
    })

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
  })
})

test('memoryUsage name space (without check)', t => {
  t.plan(9)

  const fastify = Fastify()
  fastify.register(underPressure)

  fastify.get('/', (req, reply) => {
    t.ok(fastify.memoryUsage().eventLoopDelay > 0)
    t.ok(fastify.memoryUsage().heapUsed > 0)
    t.ok(fastify.memoryUsage().rssBytes > 0)
    t.ok(fastify.memoryUsage().eventLoopUtilized >= 0)
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0 }, async (err, address) => {
    t.error(err)
    t.equal(typeof fastify.memoryUsage, 'function')
    fastify.server.unref()

    // If using monitorEventLoopDelay give it time to collect
    // some samples
    if (monitorEventLoopDelay) {
      await wait(500)
    }

    forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, response, body) => {
      t.error(err)
      t.equal(response.statusCode, 200)
      t.same(JSON.parse(body), { hello: 'world' })
      fastify.close()
    })

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
  })
})

test('Custom health check', t => {
  t.plan(8)

  t.test('should return 503 when custom health check returns false for healthCheck', t => {
    t.plan(6)

    const fastify = Fastify()
    fastify.register(underPressure, {
      healthCheck: async () => {
        return false
      },
      healthCheckInterval: 1000
    })

    fastify.get('/', (req, reply) => {
      reply.send({ hello: 'world' })
    })

    fastify.listen({ port: 0 }, (err, address) => {
      t.error(err)
      fastify.server.unref()

      forkRequest(address, 0, (err, response, body) => {
        t.error(err)
        t.equal(response.statusCode, 503)
        t.equal(response.headers['retry-after'], '10')
        t.same(JSON.parse(body), {
          code: 'FST_UNDER_PRESSURE',
          error: 'Service Unavailable',
          message: 'Service Unavailable',
          statusCode: 503
        })
        t.equal(fastify.isUnderPressure(), true)
        fastify.close()
      })
    })
  })

  t.test('should return 200 when custom health check returns true for healthCheck', t => {
    t.plan(4)

    const fastify = Fastify()
    fastify.register(underPressure, {
      healthCheck: async () => true,
      healthCheckInterval: 1000
    })

    fastify.get('/', (req, reply) => {
      reply.send({ hello: 'world' })
    })

    fastify.listen({ port: 0 }, (err, address) => {
      t.error(err)
      fastify.server.unref()

      forkRequest(address, 0, (err, response, body) => {
        t.error(err)
        t.equal(response.statusCode, 200)
        t.same(JSON.parse(body), {
          hello: 'world'
        })
        fastify.close()
      })
    })
  })

  t.test('healthCheckInterval option', t => {
    t.plan(8)

    const fastify = Fastify()
    let check = true

    fastify.register(underPressure, {
      healthCheck: async () => check,
      healthCheckInterval: 100
    })

    fastify.get('/', (req, reply) => {
      reply.send({ hello: 'world' })
    })

    fastify.listen({ port: 0 }, (err, address) => {
      t.error(err)
      fastify.server.unref()

      forkRequest(address, 0, (err, response, body) => {
        check = false
        t.error(err)
        t.equal(response.statusCode, 200)
        t.same(JSON.parse(body), {
          hello: 'world'
        })
      })

      forkRequest(address, 100, (err, response, body) => {
        t.error(err)
        t.equal(response.statusCode, 503)
        t.equal(response.headers['retry-after'], '10')
        t.same(JSON.parse(body), {
          code: 'FST_UNDER_PRESSURE',
          error: 'Service Unavailable',
          message: 'Service Unavailable',
          statusCode: 503
        })
        fastify.close()
      })
    })
  })

  t.test('should wait for the initial healthCheck call before initialising the server', t => {
    t.plan(3)

    let called = false
    const fastify = Fastify()
    fastify.register(underPressure, {
      healthCheck: async () => {
        await wait(100)
        t.notOk(called)
        called = true
      },
      healthCheckInterval: 1000
    })

    fastify.listen({ port: 0 }, (err) => {
      t.error(err)
      t.ok(called)
      fastify.close()
    })
  })

  t.test('should call the external health at every status route', t => {
    t.plan(7)

    const fastify = Fastify()
    let check = true
    fastify.register(underPressure, {
      healthCheck: async () => {
        t.pass('healthcheck called')
        return check
      },
      exposeStatusRoute: true
    })

    fastify.listen({ port: 0 }, (err, address) => {
      t.error(err)
      fastify.server.unref()
      check = false

      forkRequest(address + '/status', 0, (err, response, body) => {
        t.error(err)
        t.equal(response.statusCode, 503)
        t.equal(response.headers['retry-after'], '10')
        t.same(JSON.parse(body), {
          code: 'FST_UNDER_PRESSURE',
          error: 'Service Unavailable',
          message: 'Service Unavailable',
          statusCode: 503
        })
        fastify.close()
      })
    })
  })

  t.test('should call the external health at every status route, healthCheck throws', t => {
    t.plan(7)

    const fastify = Fastify()
    let check = true
    fastify.register(underPressure, {
      healthCheck: async () => {
        t.pass('healthcheck called')
        if (check === false) {
          throw new Error('kaboom')
        }
        return true
      },
      exposeStatusRoute: true
    })

    fastify.listen({ port: 0 }, (err, address) => {
      t.error(err)
      fastify.server.unref()
      check = false

      forkRequest(address + '/status', 0, (err, response, body) => {
        t.error(err)
        t.equal(response.statusCode, 503)
        t.equal(response.headers['retry-after'], '10')
        t.same(JSON.parse(body), {
          code: 'FST_UNDER_PRESSURE',
          error: 'Service Unavailable',
          message: 'Service Unavailable',
          statusCode: 503
        })
        fastify.close()
      })
    })
  })

  t.test('should return custom response if returned from the healthCheck function', t => {
    t.plan(6)

    const fastify = Fastify()
    fastify.register(underPressure, {
      healthCheck: async () => {
        t.pass('healthcheck called')
        return {
          some: 'value',
          anotherValue: 'another',
          status: 'overrride status'
        }
      },
      exposeStatusRoute: {
        routeResponseSchemaOpts: {
          some: { type: 'string' },
          anotherValue: { type: 'string' }
        }
      }
    })

    fastify.listen({ port: 0 }, (err, address) => {
      t.error(err)
      fastify.server.unref()

      forkRequest(address + '/status', 0, (err, response, body) => {
        t.error(err)
        t.equal(response.statusCode, 200)
        t.same(JSON.parse(body), {
          some: 'value',
          anotherValue: 'another',
          status: 'overrride status'
        })
        fastify.close()
      })
    })
  })

  t.test('should be fastify instance as argument in the healthCheck function', t => {
    t.plan(6)

    const fastify = Fastify()
    fastify.register(underPressure, {
      healthCheck: async (fastifyInstance) => {
        t.pass('healthcheck called')
        return {
          fastifyInstanceOk: fastifyInstance === fastify,
          status: 'overrride status'
        }
      },
      exposeStatusRoute: {
        routeResponseSchemaOpts: {
          fastifyInstanceOk: { type: 'boolean' }
        }
      }
    })

    fastify.listen({ port: 0 }, (err, address) => {
      t.error(err)
      fastify.server.unref()

      forkRequest(address + '/status', 0, (err, response, body) => {
        t.error(err)
        t.equal(response.statusCode, 200)
        t.same(JSON.parse(body), {
          fastifyInstanceOk: true,
          status: 'overrride status'
        })
        fastify.close()
      })
    })
  })
})

function block (msec) {
  const start = Date.now()
  /* eslint-disable no-empty */
  while (Date.now() - start < msec) { }
}
