'use strict'

const { test, afterEach, describe } = require('node:test')
const assert = require('node:assert')
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

afterEach(async () => {
  if (fastify) {
    await fastify.close()
    fastify = undefined
  }
})

test('Should return 503 on maxEventLoopDelay', async () => {
  fastify = Fastify()
  fastify.register(underPressure, {
    maxEventLoopDelay: 15
  })

  fastify.get('/', (_req, reply) => {
    reply.send({ hello: 'world' })
  })

  await new Promise((resolve, reject) => {
    fastify.listen({ port: 0 }, async (err, address) => {
      if (err) {
        reject(err)
      }
      fastify.server.unref()

      // If using monitorEventLoopDelay give it time to collect
      // some samples
      if (monitorEventLoopDelay) {
        await wait(500)
      }

      forkRequest(address, 500, (err, response, body) => {
        if (err) {
          reject(err)
        }
        assert.equal(response.statusCode, 503)
        assert.equal(response.headers['retry-after'], '10')
        assert.deepStrictEqual(JSON.parse(body), {
          code: 'FST_UNDER_PRESSURE',
          error: 'Service Unavailable',
          message: 'Service Unavailable',
          statusCode: 503
        })
        assert.equal(fastify.isUnderPressure(), true)
        resolve()
      })

      process.nextTick(() => block(1000))
    })
  })
})

const isSupportedVersion = satisfies(valid(coerce(process.version)), '12.19.0 || >=14.0.0')
test('Should return 503 on maxEventloopUtilization', { skip: !isSupportedVersion }, async () => {
  fastify = Fastify()
  fastify.register(underPressure, {
    maxEventLoopUtilization: 0.60
  })

  fastify.get('/', (_req, reply) => {
    reply.send({ hello: 'world' })
  })
  await new Promise((resolve, reject) => {
    fastify.listen({ port: 0 }, async (err, address) => {
      if (err) {
        reject(err)
      }
      fastify.server.unref()

      forkRequest(address, 500, (err, response, body) => {
        if (err) {
          reject.err(err)
        }
        assert.equal(response.statusCode, 503)
        assert.equal(response.headers['retry-after'], '10')
        assert.deepStrictEqual(JSON.parse(body), {
          code: 'FST_UNDER_PRESSURE',
          error: 'Service Unavailable',
          message: 'Service Unavailable',
          statusCode: 503
        })
        assert.equal(fastify.isUnderPressure(), true)
        resolve()
      })

      process.nextTick(() => block(1000))
    })
  })
})

test('Should return 503 on maxHeapUsedBytes', async () => {
  fastify = Fastify()
  fastify.register(underPressure, {
    maxHeapUsedBytes: 1
  })

  fastify.get('/', (_req, reply) => {
    reply.send({ hello: 'world' })
  })

  await new Promise((resolve, reject) => {
    fastify.listen({ port: 0 }, (err, address) => {
      if (err) { reject(err) }
      fastify.server.unref()

      forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, response, body) => {
        if (err) { reject(err) }
        assert.equal(response.statusCode, 503)
        assert.equal(response.headers['retry-after'], '10')
        assert.deepStrictEqual(JSON.parse(body), {
          code: 'FST_UNDER_PRESSURE',
          error: 'Service Unavailable',
          message: 'Service Unavailable',
          statusCode: 503
        })
        assert.equal(fastify.isUnderPressure(), true)
        resolve()
      })

      process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
    })
  })
})

test('Should return 503 on maxRssBytes', async () => {
  fastify = Fastify()
  fastify.register(underPressure, {
    maxRssBytes: 1
  })

  fastify.get('/', (_req, reply) => {
    reply.send({ hello: 'world' })
  })
  await new Promise((resolve, reject) => {
    fastify.listen({ port: 0 }, (err, address) => {
      if (err) { reject(err) }
      fastify.server.unref()

      forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, response, body) => {
        if (err) { reject(err) }
        assert.equal(response.statusCode, 503)
        assert.equal(response.headers['retry-after'], '10')
        assert.deepStrictEqual(JSON.parse(body), {
          code: 'FST_UNDER_PRESSURE',
          error: 'Service Unavailable',
          message: 'Service Unavailable',
          statusCode: 503
        })
        assert.equal(fastify.isUnderPressure(), true)
        resolve()
      })

      process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
    })
  })
})

test('Custom message and retry after header', async () => {
  fastify = Fastify()
  fastify.register(underPressure, {
    maxRssBytes: 1,
    message: 'Under pressure!',
    retryAfter: 50
  })

  fastify.get('/', (_req, reply) => {
    reply.send({ hello: 'world' })
  })
  await new Promise((resolve, reject) => {
    fastify.listen({ port: 0 }, (err, address) => {
      if (err) { reject(err) }
      fastify.server.unref()

      forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, response, body) => {
        if (err) { reject(err) }
        assert.equal(response.statusCode, 503)
        assert.equal(response.headers['retry-after'], '50')
        assert.deepStrictEqual(JSON.parse(body), {
          code: 'FST_UNDER_PRESSURE',
          error: 'Service Unavailable',
          message: 'Under pressure!',
          statusCode: 503
        })
        resolve()
      })

      process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
    })
  })
})

test('Custom error instance', async () => {
  class CustomError extends Error {
    constructor () {
      super('Custom error message')
      this.statusCode = 418
      this.code = 'FST_CUSTOM_ERROR'
      Error.captureStackTrace(this, CustomError)
    }
  }

  fastify = Fastify()
  fastify.register(underPressure, {
    maxRssBytes: 1,
    customError: CustomError
  })

  fastify.get('/', (_req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.setErrorHandler((err, _req, reply) => {
    assert.ok(err instanceof Error)
    return reply.code(err.statusCode).send(err)
  })
  await new Promise((resolve, reject) => {
    fastify.listen({ port: 0 }, (err, address) => {
      if (err) { reject(err) }
      fastify.server.unref()

      forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, response, body) => {
        if (err) { reject(err) }
        assert.equal(response.statusCode, 418)
        assert.deepStrictEqual(JSON.parse(body), {
          code: 'FST_CUSTOM_ERROR',
          error: 'I\'m a Teapot',
          message: 'Custom error message',
          statusCode: 418
        })
        resolve()
      })

      process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
    })
  })
})

test('memoryUsage name space', async () => {
  fastify = Fastify()
  fastify.register(underPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 100000000,
    maxRssBytes: 100000000,
    maxEventLoopUtilization: 0.85,
    pressureHandler: (_req, _rep, _type, _value) => {
      assert.ok(fastify.memoryUsage().eventLoopDelay > 0)
      assert.ok(fastify.memoryUsage().heapUsed > 0)
      assert.ok(fastify.memoryUsage().rssBytes > 0)
      assert.ok(fastify.memoryUsage().eventLoopUtilized >= 0)
    }
  })

  fastify.get('/', (_req, reply) => {
    reply.send({ hello: 'world' })
  })

  await new Promise((resolve, reject) => {
    fastify.listen({ port: 0 }, async (err, address) => {
      if (err) { reject(err) }
      assert.equal(typeof fastify.memoryUsage, 'function')
      fastify.server.unref()

      // If using monitorEventLoopDelay give it time to collect
      // some samples
      if (monitorEventLoopDelay) {
        await wait(500)
      }

      forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, response, body) => {
        if (err) { reject(err) }
        assert.equal(response.statusCode, 200)
        assert.deepStrictEqual(JSON.parse(body), { hello: 'world' })
        resolve()
      })

      process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
    })
  })
})

test('memoryUsage name space (without check)', async () => {
  fastify = Fastify()
  fastify.register(underPressure)

  fastify.get('/', (_req, reply) => {
    assert.ok(fastify.memoryUsage().eventLoopDelay > 0)
    assert.ok(fastify.memoryUsage().heapUsed > 0)
    assert.ok(fastify.memoryUsage().rssBytes > 0)
    assert.ok(fastify.memoryUsage().eventLoopUtilized >= 0)
    reply.send({ hello: 'world' })
  })

  await new Promise((resolve, reject) => {
    fastify.listen({ port: 0 }, async (err, address) => {
      if (err) { reject(err) }
      assert.equal(typeof fastify.memoryUsage, 'function')
      fastify.server.unref()

      // If using monitorEventLoopDelay give it time to collect
      // some samples
      if (monitorEventLoopDelay) {
        await wait(500)
      }

      forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, response, body) => {
        if (err) { reject(err) }
        assert.equal(response.statusCode, 200)
        assert.deepStrictEqual(JSON.parse(body), { hello: 'world' })
        resolve()
      })

      process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
    })
  })
})

describe('Custom health check', () => {
  test('should return 503 when custom health check returns false for healthCheck', async () => {
    fastify = Fastify()
    fastify.register(underPressure, {
      healthCheck: async () => {
        return false
      },
      healthCheckInterval: 1000,
    })

    fastify.get('/', (_req, reply) => {
      reply.send({ hello: 'world' })
    })

    await new Promise((resolve, reject) => {
      fastify.listen({ port: 0 }, (err, address) => {
        if (err) {
          reject(err)
        }
        fastify.server.unref()

        forkRequest(address, 0, (err, response, body) => {
          if (err) {
            reject(err)
          }
          assert.equal(response.statusCode, 503)
          assert.equal(response.headers['retry-after'], '10')
          assert.deepStrictEqual(JSON.parse(body), {
            code: 'FST_UNDER_PRESSURE',
            error: 'Service Unavailable',
            message: 'Service Unavailable',
            statusCode: 503,
          })
          assert.equal(fastify.isUnderPressure(), true)
          resolve()
        })
      })
    })
  })

  test('should return 200 when custom health check returns true for healthCheck', async () => {
    fastify = Fastify()
    fastify.register(underPressure, {
      healthCheck: async () => true,
      healthCheckInterval: 1000,
    })

    fastify.get('/', (_req, reply) => {
      reply.send({ hello: 'world' })
    })
    await new Promise((resolve, reject) => {
      fastify.listen({ port: 0 }, (err, address) => {
        if (err) {
          reject(err)
        }
        fastify.server.unref()

        forkRequest(address, 0, (err, response, body) => {
          if (err) {
            reject(err)
          }
          assert.equal(response.statusCode, 200)
          assert.deepStrictEqual(JSON.parse(body), {
            hello: 'world',
          })
          resolve()
        })
      })
    })
  })

  test('healthCheckInterval option', async () => {
    fastify = Fastify()
    let check = true

    fastify.register(underPressure, {
      healthCheck: async () => check,
      healthCheckInterval: 100,
    })

    fastify.get('/', (_req, reply) => {
      reply.send({ hello: 'world' })
    })
    await new Promise((resolve, reject) => {
      fastify.listen({ port: 0 }, (err, address) => {
        if (err) {
          reject(err)
        }
        fastify.server.unref()
        let alreadyFinished = false
        forkRequest(address, 0, (err, response, body) => {
          check = false
          if (err) {
            reject(err)
          }
          assert.equal(response.statusCode, 200)
          assert.deepStrictEqual(JSON.parse(body), {
            hello: 'world',
          })
          if (alreadyFinished) {
            resolve()
          }
          alreadyFinished = true
        })

        forkRequest(address, 100, (err, response, body) => {
          if (err) {
            reject(err)
          }
          assert.equal(response.statusCode, 503)
          assert.equal(response.headers['retry-after'], '10')
          assert.deepStrictEqual(JSON.parse(body), {
            code: 'FST_UNDER_PRESSURE',
            error: 'Service Unavailable',
            message: 'Service Unavailable',
            statusCode: 503,
          })
          if (alreadyFinished) {
            resolve()
          }
          alreadyFinished = true
        })
      })
    })
  })

  test('should wait for the initial healthCheck call before initialising the server', async () => {
    let called = false
    fastify = Fastify()
    fastify.register(underPressure, {
      healthCheck: async () => {
        await wait(100)
        assert.strictEqual(called, false)
        called = true
      },
      healthCheckInterval: 1000
    })

    await new Promise((resolve, reject) => {
      fastify.listen({ port: 0 }, (err) => {
        if (err) {
          return reject(err)
        }
        resolve()
      })
    })

    assert.ok(called)
  })

  test('should call the external health at every status route', async () => {
    fastify = Fastify()
    let check = true
    fastify.register(underPressure, {
      healthCheck: async () => {
        return check
      },
      exposeStatusRoute: true
    })
    await new Promise((resolve, reject) => {
      fastify.listen({ port: 0 }, (err, address) => {
        if (err) { reject(err) }
        fastify.server.unref()
        check = false

        forkRequest(address + '/status', 0, (err, response, body) => {
          if (err) { reject(err) }
          assert.equal(response.statusCode, 503)
          assert.equal(response.headers['retry-after'], '10')
          assert.deepStrictEqual(JSON.parse(body), {
            code: 'FST_UNDER_PRESSURE',
            error: 'Service Unavailable',
            message: 'Service Unavailable',
            statusCode: 503
          })
          resolve()
        })
      })
    })
  })

  test('should call the external health at every status route, healthCheck throws', async () => {
    fastify = Fastify()
    let check = true
    fastify.register(underPressure, {
      healthCheck: async () => {
        if (check === false) {
          throw new Error('kaboom')
        }
        return true
      },
      exposeStatusRoute: true
    })
    await new Promise((resolve, reject) => {
      fastify.listen({ port: 0 }, (err, address) => {
        if (err) { reject(err) }
        fastify.server.unref()
        check = false

        forkRequest(address + '/status', 0, (err, response, body) => {
          if (err) { reject(err) }
          assert.equal(response.statusCode, 503)
          assert.equal(response.headers['retry-after'], '10')
          assert.deepStrictEqual(JSON.parse(body), {
            code: 'FST_UNDER_PRESSURE',
            error: 'Service Unavailable',
            message: 'Service Unavailable',
            statusCode: 503
          })
          resolve()
        })
      })
    })
  })

  test('should return custom response if returned from the healthCheck function', async () => {
    fastify = Fastify()
    fastify.register(underPressure, {
      healthCheck: async () => {
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
    await new Promise((resolve, reject) => {
      fastify.listen({ port: 0 }, (err, address) => {
        if (err) { reject(err) }
        fastify.server.unref()

        forkRequest(address + '/status', 0, (err, response, body) => {
          if (err) { reject(err) }
          assert.equal(response.statusCode, 200)
          assert.deepStrictEqual(JSON.parse(body), {
            some: 'value',
            anotherValue: 'another',
            status: 'overrride status'
          })
          resolve()
        })
      })
    })
  })

  test('should be fastify instance as argument in the healthCheck function', async () => {
    fastify = Fastify()
    fastify.register(underPressure, {
      healthCheck: async (fastifyInstance) => {
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
    await new Promise((resolve, reject) => {
      fastify.listen({ port: 0 }, (err, address) => {
        if (err) { reject(err) }
        fastify.server.unref()

        forkRequest(address + '/status', 0, (err, response, body) => {
          if (err) { reject(err) }
          assert.equal(response.statusCode, 200)
          assert.deepStrictEqual(JSON.parse(body), {
            fastifyInstanceOk: true,
            status: 'overrride status'
          })
          resolve()
        })
      })
    })
  })
})
