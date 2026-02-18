'use strict'

const { test, afterEach, describe, beforeEach } = require('node:test')
const { promisify } = require('node:util')
const forkRequest = require('./forkRequest')
const Fastify = require('fastify')
const { monitorEventLoopDelay } = require('node:perf_hooks')
const underPressure = require('../index')
const { valid, satisfies, coerce } = require('semver')

const wait = promisify(setTimeout)
function block (msec) {
  const start = Date.now()
  /* eslint-disable no-empty */
  while (Date.now() - start < msec) {}
}

let fastify

beforeEach(() => {
  fastify = Fastify()
})

afterEach(async () => {
  await fastify.close()
})

test('Should return 503 on maxEventLoopDelay', (t, done) => {
  t.plan(6)
  fastify.register(underPressure, {
    maxEventLoopDelay: 15
  })

  fastify.get('/', (_req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
    t.assert.ifError(err)
    fastify.server.unref()

    forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, response, body) => {
      t.assert.ifError(err)
      t.assert.equal(response.statusCode, 503)
      t.assert.equal(response.headers['retry-after'], '10')
      t.assert.deepStrictEqual(JSON.parse(body), {
        code: 'FST_UNDER_PRESSURE',
        error: 'Service Unavailable',
        message: 'Service Unavailable',
        statusCode: 503
      })
      t.assert.equal(fastify.isUnderPressure(), true)
      fastify.close()
      done()
    })

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
  })
})

const isSupportedVersion = satisfies(
  valid(coerce(process.version)),
  '12.19.0 || >=14.0.0'
)
test(
  'Should return 503 on maxEventloopUtilization',
  { skip: !isSupportedVersion },
  (t, done) => {
    t.plan(6)
    fastify.register(underPressure, {
      maxEventLoopUtilization: 0.6,
    })

    fastify.get('/', (_req, reply) => {
      reply.send({ hello: 'world' })
    })
    fastify.listen({ port: 0, host: '127.0.0.1' }, async (err, address) => {
      t.assert.ifError(err)
      fastify.server.unref()

      forkRequest(address, 500, (err, response, body) => {
        t.assert.ifError(err)
        t.assert.equal(response.statusCode, 503)
        t.assert.equal(response.headers['retry-after'], '10')
        t.assert.deepStrictEqual(JSON.parse(body), {
          code: 'FST_UNDER_PRESSURE',
          error: 'Service Unavailable',
          message: 'Service Unavailable',
          statusCode: 503,
        })
        t.assert.equal(fastify.isUnderPressure(), true)
        done()
      })

      process.nextTick(() => block(1000))
    })
  })

test('Should return 503 on maxHeapUsedBytes', (t, done) => {
  t.plan(6)
  fastify.register(underPressure, {
    maxHeapUsedBytes: 1
  })

  fastify.get('/', (_req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
    t.assert.ifError(err)
    fastify.server.unref()

    forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, response, body) => {
      t.assert.ifError(err)
      t.assert.equal(response.statusCode, 503)
      t.assert.equal(response.headers['retry-after'], '10')
      t.assert.deepStrictEqual(JSON.parse(body), {
        code: 'FST_UNDER_PRESSURE',
        error: 'Service Unavailable',
        message: 'Service Unavailable',
        statusCode: 503
      })
      t.assert.equal(fastify.isUnderPressure(), true)
      fastify.close()
      done()
    })

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
  })
})

test('Should return 503 on maxRssBytes', (t, done) => {
  t.plan(6)
  const fastify = Fastify()
  fastify.register(underPressure, {
    maxRssBytes: 1
  })

  fastify.get('/', (_req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
    t.assert.ifError(err)
    fastify.server.unref()

    forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, response, body) => {
      t.assert.ifError(err)
      t.assert.equal(response.statusCode, 503)
      t.assert.equal(response.headers['retry-after'], '10')
      t.assert.deepStrictEqual(JSON.parse(body), {
        code: 'FST_UNDER_PRESSURE',
        error: 'Service Unavailable',
        message: 'Service Unavailable',
        statusCode: 503
      })
      t.assert.equal(fastify.isUnderPressure(), true)
      fastify.close()
      done()
    })

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
  })
})

test('Custom message and retry after header', (t, done) => {
  t.plan(5)
  fastify.register(underPressure, {
    maxRssBytes: 1,
    message: 'Under pressure!',
    retryAfter: 50
  })

  fastify.get('/', (_req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
    t.assert.ifError(err)
    fastify.server.unref()

    forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, response, body) => {
      t.assert.ifError(err)
      t.assert.equal(response.statusCode, 503)
      t.assert.equal(response.headers['retry-after'], '50')
      t.assert.deepStrictEqual(JSON.parse(body), {
        code: 'FST_UNDER_PRESSURE',
        error: 'Service Unavailable',
        message: 'Under pressure!',
        statusCode: 503
      })
      fastify.close()
      done()
    })

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
  })
})

test('Custom error instance', (t, done) => {
  t.plan(5)
  class CustomError extends Error {
    constructor () {
      super('Custom error message')
      this.statusCode = 418
      this.code = 'FST_CUSTOM_ERROR'
      Error.captureStackTrace(this, CustomError)
    }
  }

  fastify.register(underPressure, {
    maxRssBytes: 1,
    customError: CustomError,
  })

  fastify.get('/', (_req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.setErrorHandler((err, _req, reply) => {
    t.assert.ok(err instanceof Error)
    return reply.code(err.statusCode).send(err)
  })

  fastify.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
    t.assert.ifError(err)
    fastify.server.unref()

    forkRequest(
      address,
      monitorEventLoopDelay ? 750 : 250,
      (err, response, body) => {
        t.assert.ifError(err)
        t.assert.equal(response.statusCode, 418)
        t.assert.deepStrictEqual(JSON.parse(body), {
          code: 'FST_CUSTOM_ERROR',
          error: "I'm a Teapot",
          message: 'Custom error message',
          statusCode: 418,
        })
        done()
      }
    )

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
  })
})

test('memoryUsage name space', (t, done) => {
  fastify.register(underPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 100000000,
    maxRssBytes: 100000000,
    maxEventLoopUtilization: 0.85,
    pressureHandler: (_req, _rep, _type, _value) => {
      t.assert.ok(false)
      t.assert.ok(fastify.memoryUsage().eventLoopDelay > 0)
      t.assert.ok(fastify.memoryUsage().heapUsed > 0)
      t.assert.ok(fastify.memoryUsage().rssBytes > 0)
      t.assert.ok(fastify.memoryUsage().eventLoopUtilized >= 0)
    },
  })
  fastify.get('/', (_req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0, host: '127.0.0.1' }, async (err, address) => {
    t.assert.ifError(err)
    t.assert.equal(typeof fastify.memoryUsage, 'function')
    fastify.server.unref()

    // If using monitorEventLoopDelay give it time to collect
    // some samples
    if (monitorEventLoopDelay) {
      await wait(500)
    }

    forkRequest(
      address,
      monitorEventLoopDelay ? 750 : 250,
      (err, response, body) => {
        t.assert.ifError(err)
        t.assert.equal(response.statusCode, 200)
        t.assert.deepStrictEqual(JSON.parse(body), { hello: 'world' })
        done()
      }
    )

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
  })
})

test('memoryUsage name space (without check)', (t, done) => {
  const IS_WINDOWS = process.platform === 'win32'
  t.plan(9)
  fastify.register(underPressure)

  fastify.get('/', (_req, reply) => {
    t.assert.ok(fastify.memoryUsage().eventLoopDelay > 0)
    t.assert.ok(fastify.memoryUsage().heapUsed > 0)
    t.assert.ok(fastify.memoryUsage().rssBytes > 0)
    t.assert.ok(fastify.memoryUsage().eventLoopUtilized >= 0)
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0, host: '127.0.0.1' }, async (err, address) => {
    t.assert.ifError(err)
    t.assert.equal(typeof fastify.memoryUsage, 'function')
    fastify.server.unref()

    // If using monitorEventLoopDelay, give it time to collect some samples
    if (monitorEventLoopDelay) {
      await wait(IS_WINDOWS ? 1000 : 500)
    }

    forkRequest(
      address,
      monitorEventLoopDelay ? (IS_WINDOWS ? 1500 : 750) : (IS_WINDOWS ? 500 : 250),
      (err, response, body) => {
        t.assert.ifError(err)
        t.assert.equal(response.statusCode, 200)
        t.assert.deepStrictEqual(JSON.parse(body), { hello: 'world' })
        done()
      }
    )

    process.nextTick(() => block(monitorEventLoopDelay ? (IS_WINDOWS ? 3000 : 1500) : (IS_WINDOWS ? 1000 : 500)))
  })
})

describe('Custom health check', () => {
  test('should return 503 when custom health check returns false for healthCheck', (t, done) => {
    t.plan(6)
    fastify.register(underPressure, {
      healthCheck: async () => {
        return false
      },
      healthCheckInterval: 1000,
    })

    fastify.get('/', (_req, reply) => {
      reply.send({ hello: 'world' })
    })

    fastify.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
      t.assert.ifError(err)
      fastify.server.unref()

      forkRequest(address, 0, (err, response, body) => {
        t.assert.ifError(err)
        t.assert.equal(response.statusCode, 503)
        t.assert.equal(response.headers['retry-after'], '10')
        t.assert.deepStrictEqual(JSON.parse(body), {
          code: 'FST_UNDER_PRESSURE',
          error: 'Service Unavailable',
          message: 'Service Unavailable',
          statusCode: 503,
        })
        t.assert.equal(fastify.isUnderPressure(), true)
        done()
      })
    })
  })

  test('should return 200 when custom health check returns true for healthCheck', (t, done) => {
    t.plan(4)
    fastify.register(underPressure, {
      healthCheck: async () => true,
      healthCheckInterval: 1000,
    })

    fastify.get('/', (_req, reply) => {
      reply.send({ hello: 'world' })
    })
    fastify.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
      t.assert.ifError(err)
      fastify.server.unref()

      forkRequest(address, 0, (err, response, body) => {
        t.assert.ifError(err)
        t.assert.equal(response.statusCode, 200)
        t.assert.deepStrictEqual(JSON.parse(body), {
          hello: 'world',
        })
        done()
      })
    })
  })

  test('healthCheckInterval option', (t, done) => {
    t.plan(8)
    let check = true

    fastify.register(underPressure, {
      healthCheck: async () => check,
      healthCheckInterval: 100,
    })

    fastify.get('/', (_req, reply) => {
      reply.send({ hello: 'world' })
    })
    fastify.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
      t.assert.ifError(err)
      fastify.server.unref()
      let alreadyFinished = false
      forkRequest(address, 0, (err, response, body) => {
        check = false
        t.assert.ifError(err)
        t.assert.equal(response.statusCode, 200)
        t.assert.deepStrictEqual(JSON.parse(body), {
          hello: 'world',
        })
        if (alreadyFinished) {
          done()
        }
        alreadyFinished = true
      })

      forkRequest(address, 250, (err, response, body) => {
        t.assert.ifError(err)
        t.assert.equal(response.statusCode, 503)
        t.assert.equal(response.headers['retry-after'], '10')
        t.assert.deepStrictEqual(JSON.parse(body), {
          code: 'FST_UNDER_PRESSURE',
          error: 'Service Unavailable',
          message: 'Service Unavailable',
          statusCode: 503,
        })
        if (alreadyFinished) {
          done()
        }
        alreadyFinished = true
      })
    })
  })
})

test('should wait for the initial healthCheck call before initialising the server', async (t) => {
  t.plan(2)
  let called = false

  fastify.register(underPressure, {
    healthCheck: async () => {
      await wait(100)
      t.assert.strictEqual(called, false)
      called = true
    },
    healthCheckInterval: 1000,
  })

  await fastify.listen({ port: 0, host: '127.0.0.1' })

  t.assert.ok(called)
})

test('should call the external health at every status route', (t, done) => {
  t.plan(5)
  let check = true
  fastify.register(underPressure, {
    healthCheck: async () => {
      return check
    },
    exposeStatusRoute: true,
  })
  fastify.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
    t.assert.ifError(err)
    fastify.server.unref()
    check = false

    forkRequest(address + '/status', 0, (err, response, body) => {
      t.assert.ifError(err)
      t.assert.equal(response.statusCode, 503)
      t.assert.equal(response.headers['retry-after'], '10')
      t.assert.deepStrictEqual(JSON.parse(body), {
        code: 'FST_UNDER_PRESSURE',
        error: 'Service Unavailable',
        message: 'Service Unavailable',
        statusCode: 503,
      })
      done()
    })
  })
})

test('should call the external health at every status route, healthCheck throws', (t, done) => {
  t.plan(5)
  let check = true
  fastify.register(underPressure, {
    healthCheck: async () => {
      if (check === false) {
        throw new Error('kaboom')
      }
      return true
    },
    exposeStatusRoute: true,
  })
  fastify.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
    t.assert.ifError(err)
    fastify.server.unref()
    check = false

    forkRequest(address + '/status', 0, (err, response, body) => {
      t.assert.ifError(err)
      t.assert.equal(response.statusCode, 503)
      t.assert.equal(response.headers['retry-after'], '10')
      t.assert.deepStrictEqual(JSON.parse(body), {
        code: 'FST_UNDER_PRESSURE',
        error: 'Service Unavailable',
        message: 'Service Unavailable',
        statusCode: 503,
      })
      done()
    })
  })
})

test('should return custom response if returned from the healthCheck function', (t, done) => {
  t.plan(4)
  fastify.register(underPressure, {
    healthCheck: async () => {
      return {
        some: 'value',
        anotherValue: 'another',
        status: 'overrride status',
      }
    },
    exposeStatusRoute: {
      routeResponseSchemaOpts: {
        some: { type: 'string' },
        anotherValue: { type: 'string' },
      },
    },
  })
  fastify.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
    t.assert.ifError(err)
    fastify.server.unref()

    forkRequest(address + '/status', 0, (err, response, body) => {
      t.assert.ifError(err)
      t.assert.equal(response.statusCode, 200)
      t.assert.deepStrictEqual(JSON.parse(body), {
        some: 'value',
        anotherValue: 'another',
        status: 'overrride status',
      })
      done()
    })
  })
})

test('should be fastify instance as argument in the healthCheck function', (t, done) => {
  t.plan(4)
  fastify.register(underPressure, {
    healthCheck: async (fastifyInstance) => {
      return {
        fastifyInstanceOk: fastifyInstance === fastify,
        status: 'overrride status',
      }
    },
    exposeStatusRoute: {
      routeResponseSchemaOpts: {
        fastifyInstanceOk: { type: 'boolean' },
      },
    },
  })
  fastify.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
    t.assert.ifError(err)
    fastify.server.unref()

    forkRequest(address + '/status', 0, (err, response, body) => {
      t.assert.ifError(err)
      t.assert.equal(response.statusCode, 200)
      t.assert.deepStrictEqual(JSON.parse(body), {
        fastifyInstanceOk: true,
        status: 'overrride status',
      })
      done()
    })
  })
})
