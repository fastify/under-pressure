'use strict'

const { test } = require('tap')
const { promisify } = require('node:util')
const forkRequest = require('./forkRequest')
const Fastify = require('fastify')
const { monitorEventLoopDelay } = require('node:perf_hooks')
const underPressure = require('../index')
const { valid, satisfies, coerce } = require('semver')
const sinon = require('sinon')

const wait = promisify(setTimeout)
const isSupportedVersion = satisfies(valid(coerce(process.version)), '12.19.0 || >=14.0.0')

function block (msec) {
  const start = Date.now()
  /* eslint-disable no-empty */
  while (Date.now() - start < msec) { }
}

test('health check', async t => {
  test('simple', async t => {
    t.plan(3)
    const fastify = Fastify()

    fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1,
      pressureHandler: (req, rep, type, value) => {
        t.equal(type, underPressure.TYPE_HEALTH_CHECK)
        t.equal(value, undefined)
        rep.send('B')
      }
    })

    fastify.get('/', (req, rep) => rep.send('A'))

    t.equal((await fastify.inject().get('/').end()).body, 'B')
  })

  test('delayed handling with promise success', async t => {
    const fastify = Fastify()

    fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1,
      pressureHandler: async (req, rep, type, value) => {
        await wait(250)
        rep.send('B')
      }
    })

    fastify.get('/', (req, rep) => rep.send('A'))

    t.equal((await fastify.inject().get('/').end()).body, 'B')
  })

  test('delayed handling with promise error', async t => {
    const fastify = Fastify()

    const errorMessage = 'promiseError'

    fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1,
      pressureHandler: async (req, rep, type, value) => {
        await wait(250)
        throw new Error(errorMessage)
      }
    })

    fastify.get('/', (req, rep) => rep.send('A'))

    const response = await fastify.inject().get('/').end()
    t.equal(response.statusCode, 500)
    t.equal(JSON.parse(response.body).message, errorMessage)
  })

  test('no handling', async t => {
    const fastify = Fastify()

    fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1,
      pressureHandler: (req, rep, type, value) => { }
    })

    fastify.get('/', (req, rep) => rep.send('A'))

    t.equal((await fastify.inject().get('/').end()).body, 'A')
  })

  test('return response', async t => {
    const fastify = Fastify()

    fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1,
      pressureHandler: (req, rep, type, value) => 'B'
    })

    fastify.get('/', (req, rep) => rep.send('A'))

    t.equal((await fastify.inject().get('/').end()).body, 'B')
  })

  test('interval reentrance', async t => {
    const clock = sinon.useFakeTimers()
    t.teardown(() => sinon.restore())

    const healthCheckInterval = 500

    const fastify = Fastify()

    const healthCheck = sinon.fake(async () => {
      await wait(healthCheckInterval * 2)
      return true
    })

    fastify.register(underPressure, {
      healthCheck,
      healthCheckInterval
    })

    // not called until fastify has finished initializing
    sinon.assert.callCount(healthCheck, 0)

    await fastify.ready()

    // called immediately when registering the plugin
    sinon.assert.callCount(healthCheck, 1)

    // wait until next execution
    await clock.tickAsync(healthCheckInterval)

    // scheduled by the timer
    sinon.assert.callCount(healthCheck, 2)

    await clock.tickAsync(healthCheckInterval)

    // still running the previous invocation
    sinon.assert.callCount(healthCheck, 2)

    // wait until the last call resolves and schedules another invocation
    await healthCheck.lastCall.returnValue

    await clock.tickAsync(healthCheckInterval)

    // next timer invocation
    sinon.assert.callCount(healthCheck, 3)
  })
})

test('event loop delay', { skip: !monitorEventLoopDelay }, t => {
  t.plan(5)
  const fastify = Fastify()

  fastify.register(underPressure, {
    maxEventLoopDelay: 1,
    pressureHandler: (req, rep, type, value) => {
      t.equal(type, underPressure.TYPE_EVENT_LOOP_DELAY)
      t.ok(value > 1)
      rep.send('B')
    }
  })

  fastify.get('/', (req, rep) => rep.send('A'))
  fastify.listen({ port: 3000 }, async (err, address) => {
    t.error(err)
    fastify.server.unref()

    forkRequest(address, 500, (err, response, body) => {
      t.error(err)
      t.equal(body, 'B')
      fastify.close()
    })
    process.nextTick(() => block(1500))
  })
})

test('heap bytes', t => {
  t.plan(5)

  const fastify = Fastify()
  fastify.register(underPressure, {
    maxHeapUsedBytes: 1,
    pressureHandler: (req, rep, type, value) => {
      t.equal(type, underPressure.TYPE_HEAP_USED_BYTES)
      t.ok(value > 1)
      rep.send('B')
    }
  })

  fastify.get('/', (req, rep) => rep.send('A'))

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    fastify.server.unref()

    forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, response, body) => {
      t.error(err)
      t.equal(body.toString(), 'B')
      fastify.close()
    })

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
  })
})

test('rss bytes', t => {
  t.plan(5)

  const fastify = Fastify()
  fastify.register(underPressure, {
    maxRssBytes: 1,
    pressureHandler: (req, rep, type, value) => {
      t.equal(type, underPressure.TYPE_RSS_BYTES)
      t.ok(value > 1)
      rep.send('B')
    }
  })

  fastify.get('/', (req, rep) => rep.send('A'))

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    fastify.server.unref()

    forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, response, body) => {
      t.error(err)
      t.equal(body.toString(), 'B')
      fastify.close()
    })

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
  })
})

test('event loop utilization', { skip: !isSupportedVersion }, t => {
  t.plan(5)

  const fastify = Fastify()
  fastify.register(underPressure, {
    maxEventLoopUtilization: 0.01,
    pressureHandler: (req, rep, type, value) => {
      t.equal(type, underPressure.TYPE_EVENT_LOOP_UTILIZATION)
      t.ok(value > 0.01 && value <= 1)
      rep.send('B')
    }
  })

  fastify.get('/', async (req, rep) => rep.send('A'))

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    fastify.server.unref()

    forkRequest(address, 500, (err, response, body) => {
      t.error(err)
      t.equal(body.toString(), 'B')
      fastify.close()
    })

    process.nextTick(() => block(1000))
  })
})

test('event loop delay (NaN)', { skip: !isSupportedVersion }, t => {
  t.plan(5)

  const mockedUnderPressure = t.mock('../index', {
    perf_hooks: {
      monitorEventLoopDelay: () => ({
        enable: () => { },
        reset: () => { },
        mean: NaN
      }),
      performance: {
        eventLoopUtilization: () => { }
      }
    }
  })

  const fastify = Fastify()
  fastify.register(mockedUnderPressure, {
    maxEventLoopDelay: 1000,
    pressureHandler: (req, rep, type, value) => {
      t.equal(type, underPressure.TYPE_EVENT_LOOP_DELAY)
      t.equal(value, Infinity)
      rep.send('B')
    }
  })

  fastify.get('/', async (req, rep) => rep.send('A'))

  fastify.listen({ port: 0 }, (err, address) => {
    t.error(err)
    fastify.server.unref()

    forkRequest(address, 500, (err, response, body) => {
      t.error(err)
      t.equal(body.toString(), 'B')
      fastify.close()
    })
    process.nextTick(() => block(1000))
  })
})

test('pressureHandler on route', async t => {
  test('simple', async t => {
    t.plan(3)
    const fastify = Fastify()

    await fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1
    })

    fastify.get('/', {
      config: {
        pressureHandler: (req, rep, type, value) => {
          process._rawDebug('pressureHandler')
          t.equal(type, underPressure.TYPE_HEALTH_CHECK)
          t.equal(value, undefined)
          rep.send('B')
        }
      }
    }, (req, rep) => rep.send('A'))

    t.equal((await fastify.inject().get('/').end()).body, 'B')
  })

  test('delayed handling with promise success', async t => {
    const fastify = Fastify()

    fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1
    })

    fastify.get('/', {
      config: {
        pressureHandler: async (req, rep, type, value) => {
          await wait(250)
          rep.send('B')
        }
      }
    }, (req, rep) => rep.send('A'))

    t.equal((await fastify.inject().get('/').end()).body, 'B')
  })

  test('delayed handling with promise error', async t => {
    const fastify = Fastify()

    const errorMessage = 'promiseError'

    fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1
    })

    fastify.get('/', {
      config: {
        pressureHandler: async (req, rep, type, value) => {
          await wait(250)
          throw new Error(errorMessage)
        }
      }
    }, (req, rep) => rep.send('A'))

    const response = await fastify.inject().get('/').end()
    t.equal(response.statusCode, 500)
    t.equal(JSON.parse(response.body).message, errorMessage)
  })

  test('no handling', async t => {
    const fastify = Fastify()

    fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1
    })

    fastify.get('/', {
      config: {
        pressureHandler: (req, rep, type, value) => { }
      }
    }, (req, rep) => rep.send('A'))

    t.equal((await fastify.inject().get('/').end()).body, 'A')
  })

  test('return response', async t => {
    const fastify = Fastify()

    fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1
    })

    fastify.get('/', {
      config: {
        pressureHandler: (req, rep, type, value) => 'B'
      }
    }, (req, rep) => rep.send('A'))

    t.equal((await fastify.inject().get('/').end()).body, 'B')
  })
})
