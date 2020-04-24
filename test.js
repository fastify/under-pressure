'use strict'

const t = require('tap')
const test = t.test
const { promisify } = require('util')
const sget = require('simple-get').concat
const Fastify = require('fastify')
const { monitorEventLoopDelay } = require('perf_hooks')
const underPressure = require('./index')

const wait = promisify(setTimeout)

test('Should return 503 on maxEventLoopDelay', t => {
  t.plan(5)

  const fastify = Fastify()
  fastify.register(underPressure, {
    maxEventLoopDelay: 15
  })

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen(0, async (err, address) => {
    t.error(err)
    fastify.server.unref()

    // If using monitorEventLoopDelay give it time to collect
    // some samples
    if (monitorEventLoopDelay) {
      await wait(500)
    }

    // Increased to prevent Travis to fail
    process.nextTick(() => block(1000))

    sget({
      method: 'GET',
      url: address
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 503)
      t.strictEqual(response.headers['retry-after'], '10')
      t.deepEqual(JSON.parse(body), {
        error: 'Service Unavailable',
        message: 'Service Unavailable',
        statusCode: 503
      })
      fastify.close()
    })
  })
})

test('Should return 503 on maxHeapUsedBytes', t => {
  t.plan(5)

  const fastify = Fastify()
  fastify.register(underPressure, {
    maxHeapUsedBytes: 1
  })

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen(0, (err, address) => {
    t.error(err)
    fastify.server.unref()

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))

    sget({
      method: 'GET',
      url: address
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 503)
      t.strictEqual(response.headers['retry-after'], '10')
      t.deepEqual(JSON.parse(body), {
        error: 'Service Unavailable',
        message: 'Service Unavailable',
        statusCode: 503
      })
      fastify.close()
    })
  })
})

test('Should return 503 on maxRssBytes', t => {
  t.plan(5)

  const fastify = Fastify()
  fastify.register(underPressure, {
    maxRssBytes: 1
  })

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen(0, (err, address) => {
    t.error(err)
    fastify.server.unref()

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))

    sget({
      method: 'GET',
      url: address
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 503)
      t.strictEqual(response.headers['retry-after'], '10')
      t.deepEqual(JSON.parse(body), {
        error: 'Service Unavailable',
        message: 'Service Unavailable',
        statusCode: 503
      })
      fastify.close()
    })
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

  fastify.listen(0, (err, address) => {
    t.error(err)
    fastify.server.unref()

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))

    sget({
      method: 'GET',
      url: address
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 503)
      t.strictEqual(response.headers['retry-after'], '50')
      t.deepEqual(JSON.parse(body), {
        error: 'Service Unavailable',
        message: 'Under pressure!',
        statusCode: 503
      })
      fastify.close()
    })
  })
})

test('memoryUsage name space', t => {
  t.plan(8)

  const fastify = Fastify()
  fastify.register(underPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 100000000,
    maxRssBytes: 100000000
  })

  fastify.get('/', (req, reply) => {
    t.true(fastify.memoryUsage().eventLoopDelay > 0)
    t.true(fastify.memoryUsage().heapUsed > 0)
    t.true(fastify.memoryUsage().rssBytes > 0)
    reply.send({ hello: 'world' })
  })

  fastify.listen(0, async (err, address) => {
    t.error(err)
    t.is(typeof fastify.memoryUsage, 'function')
    fastify.server.unref()

    // If using monitorEventLoopDelay give it time to collect
    // some samples
    if (monitorEventLoopDelay) {
      await wait(500)
    }

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))

    sget({
      method: 'GET',
      url: address
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.deepEqual(JSON.parse(body), { hello: 'world' })
      fastify.close()
    })
  })
})

test('memoryUsage name space (without check)', t => {
  t.plan(8)

  const fastify = Fastify()
  fastify.register(underPressure)

  fastify.get('/', (req, reply) => {
    t.true(fastify.memoryUsage().eventLoopDelay > 0)
    t.true(fastify.memoryUsage().heapUsed > 0)
    t.true(fastify.memoryUsage().rssBytes > 0)
    reply.send({ hello: 'world' })
  })

  fastify.listen(0, async (err, address) => {
    t.error(err)
    t.is(typeof fastify.memoryUsage, 'function')
    fastify.server.unref()

    // If using monitorEventLoopDelay give it time to collect
    // some samples
    if (monitorEventLoopDelay) {
      await wait(500)
    }

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))

    sget({
      method: 'GET',
      url: address
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.deepEqual(JSON.parse(body), { hello: 'world' })
      fastify.close()
    })
  })
})

test('Expose status route', t => {
  t.plan(4)

  const fastify = Fastify()
  fastify.register(underPressure, {
    exposeStatusRoute: true
  })

  fastify.listen(0, (err, address) => {
    t.error(err)
    fastify.server.unref()

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))

    sget({
      method: 'GET',
      url: `${address}/status`
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.deepEqual(JSON.parse(body), { status: 'ok' })
      fastify.close()
    })
  })
})

test('Expose custom status route', t => {
  t.plan(5)

  const fastify = Fastify()
  t.tearDown(() => fastify.close())

  fastify.register(underPressure, {
    exposeStatusRoute: '/alive'
  })

  fastify.inject({
    url: '/status'
  }, (err, response) => {
    t.error(err)
    t.strictEqual(response.statusCode, 404)
  })

  fastify.inject({
    url: '/alive'
  }, (err, response) => {
    t.error(err)
    t.strictEqual(response.statusCode, 200)
    t.deepEqual(JSON.parse(response.payload), { status: 'ok' })
  })
})

test('Expose status route with additional route options', t => {
  t.plan(3)

  const customConfig = {
    customVal: 'someVal'
  }
  const fastify = Fastify()
  fastify.register(underPressure, {
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'silent',
        config: customConfig
      },
      url: '/alive'
    }
  })

  fastify.addHook('onRoute', (routeOptions) => {
    fastify.server.unref()
    process.nextTick(() => block(500))
    t.strictEqual(routeOptions.url, '/alive')
    t.strictEqual(routeOptions.logLevel, 'silent', 'log level not set')
    t.deepEqual(routeOptions.config, customConfig, 'config not set')
    fastify.close()
  })

  fastify.listen()
})

test('Expose status route with additional route options and default url', t => {
  t.plan(2)

  const fastify = Fastify()
  fastify.register(underPressure, {
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'silent'
      }
    }
  })
  fastify.addHook('onRoute', (routeOptions) => {
    fastify.server.unref()
    process.nextTick(() => block(500))
    t.strictEqual(routeOptions.url, '/status')
    t.strictEqual(routeOptions.logLevel, 'silent', 'log level not set')
    fastify.close()
  })

  fastify.listen()
})

test('Custom health check', t => {
  t.plan(6)

  t.test('should return 503 when custom health check returns false for healthCheck', t => {
    t.plan(5)

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

    fastify.listen(0, (err, address) => {
      t.error(err)
      fastify.server.unref()

      sget({
        method: 'GET',
        url: address
      }, (err, response, body) => {
        t.error(err)
        t.strictEqual(response.statusCode, 503)
        t.strictEqual(response.headers['retry-after'], '10')
        t.deepEqual(JSON.parse(body), {
          error: 'Service Unavailable',
          message: 'Service Unavailable',
          statusCode: 503
        })
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

    fastify.listen(0, (err, address) => {
      t.error(err)
      fastify.server.unref()

      sget({
        method: 'GET',
        url: address
      }, (err, response, body) => {
        t.error(err)
        t.strictEqual(response.statusCode, 200)
        t.deepEqual(JSON.parse(body), {
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

    fastify.listen(0, (err, address) => {
      t.error(err)
      fastify.server.unref()
      sget({
        method: 'GET',
        url: address
      }, (err, response, body) => {
        check = false
        t.error(err)
        t.strictEqual(response.statusCode, 200)
        t.deepEqual(JSON.parse(body), {
          hello: 'world'
        })
      })

      setTimeout(function () {
        sget({
          method: 'GET',
          url: address
        }, (err, response, body) => {
          t.error(err)
          t.strictEqual(response.statusCode, 503)
          t.strictEqual(response.headers['retry-after'], '10')
          t.deepEqual(JSON.parse(body), {
            error: 'Service Unavailable',
            message: 'Service Unavailable',
            statusCode: 503
          })
          fastify.close()
        })
      }, 100)
    })
  })

  t.test('should wait for the initial healthCheck call before initialising the server', t => {
    t.plan(3)

    let called = false
    const fastify = Fastify()
    fastify.register(underPressure, {
      healthCheck: async () => {
        await wait(100)
        t.false(called)
        called = true
      },
      healthCheckInterval: 1000
    })

    fastify.listen(0, (err) => {
      t.error(err)
      t.true(called)
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

    fastify.listen(0, (err, address) => {
      t.error(err)
      fastify.server.unref()
      check = false

      sget({
        method: 'GET',
        url: address + '/status'
      }, (err, response, body) => {
        t.error(err)
        t.strictEqual(response.statusCode, 503)
        t.strictEqual(response.headers['retry-after'], '10')
        t.deepEqual(JSON.parse(body), {
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

    fastify.listen(0, (err, address) => {
      t.error(err)
      fastify.server.unref()
      check = false

      sget({
        method: 'GET',
        url: address + '/status'
      }, (err, response, body) => {
        t.error(err)
        t.strictEqual(response.statusCode, 503)
        t.strictEqual(response.headers['retry-after'], '10')
        t.deepEqual(JSON.parse(body), {
          error: 'Service Unavailable',
          message: 'Service Unavailable',
          statusCode: 503
        })
        fastify.close()
      })
    })
  })
})

function block (msec) {
  const start = Date.now()
  while (Date.now() - start < msec) {}
}
