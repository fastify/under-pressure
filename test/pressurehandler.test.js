'use strict'

const { test, afterEach, describe, after, beforeEach } = require('node:test')
const assert = require('node:assert')
const { promisify } = require('node:util')
const forkRequest = require('./forkRequest')
const Fastify = require('fastify')
const { monitorEventLoopDelay } = require('node:perf_hooks')
const underPressure = require('../index')
const { valid, satisfies, coerce } = require('semver')
const sinon = require('sinon')
const proxyquire = require('proxyquire')

const wait = promisify(setTimeout)
const isSupportedVersion = satisfies(valid(coerce(process.version)), '12.19.0 || >=14.0.0')

function block (msec) {
  const start = Date.now()
  /* eslint-disable no-empty */
  while (Date.now() - start < msec) { }
}

let fastify
beforeEach(() => {
  fastify = Fastify()
})

afterEach(async () => {
  await fastify.close()
})

describe('health check', async () => {
  test('simple', async () => {
    fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1,
      pressureHandler: (_req, rep, type, value) => {
        assert.equal(type, underPressure.TYPE_HEALTH_CHECK)
        assert.equal(value, undefined)
        rep.send('B')
      }
    })

    fastify.get('/', (_req, rep) => rep.send('A'))

    assert.equal((await fastify.inject().get('/').end()).body, 'B')
  })

  test('delayed handling with promise success', async () => {
    fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1,
      pressureHandler: async (_req, rep, _type, _value) => {
        await wait(250)
        rep.send('B')
      }
    })

    fastify.get('/', (_req, rep) => rep.send('A'))

    assert.equal((await fastify.inject().get('/').end()).body, 'B')
  })

  test('delayed handling with promise error', async () => {
    const errorMessage = 'promiseError'

    fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1,
      pressureHandler: async (_req, _rep, _type, _value) => {
        await wait(250)
        throw new Error(errorMessage)
      }
    })

    fastify.get('/', (_req, rep) => rep.send('A'))

    const response = await fastify.inject().get('/').end()
    assert.equal(response.statusCode, 500)
    assert.equal(JSON.parse(response.body).message, errorMessage)
  })

  test('no handling', async () => {
    fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1,
      pressureHandler: (_req, _rep, _type, _value) => { }
    })

    fastify.get('/', (_req, rep) => rep.send('A'))

    assert.equal((await fastify.inject().get('/').end()).body, 'A')
  })

  test('return response', async () => {
    fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1,
      pressureHandler: (_req, _rep, _type, _value) => 'B'
    })

    fastify.get('/', (_req, rep) => rep.send('A'))

    assert.equal((await fastify.inject().get('/').end()).body, 'B')
  })

  test('interval reentrance', async () => {
    const clock = sinon.useFakeTimers()
    after(() => sinon.restore())

    const healthCheckInterval = 500

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

test('event loop delay', { skip: !monitorEventLoopDelay }, (t, done) => {
  t.plan(5)
  fastify.register(underPressure, {
    maxEventLoopDelay: 1,
    pressureHandler: (_req, rep, type, value) => {
      t.assert.equal(type, underPressure.TYPE_EVENT_LOOP_DELAY)
      t.assert.ok(value > 1)
      rep.send('B')
    }
  })

  fastify.get('/', (_req, rep) => rep.send('A'))
  fastify.listen({ port: 3000, host: '127.0.0.1' }, async (err, address) => {
    t.assert.ifError(err)
    fastify.server.unref()

    forkRequest(address, 500, (err, _response, body) => {
      t.assert.ifError(err)
      t.assert.equal(body, 'B')
      done()
    })
    process.nextTick(() => block(1500))
  })
})

test('heap bytes', (t, done) => {
  t.plan(5)
  fastify.register(underPressure, {
    maxHeapUsedBytes: 1,
    pressureHandler: (_req, rep, type, value) => {
      t.assert.equal(type, underPressure.TYPE_HEAP_USED_BYTES)
      t.assert.ok(value > 1)
      rep.send('B')
    }
  })

  fastify.get('/', (_req, rep) => rep.send('A'))

  fastify.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
    t.assert.ifError(err)
    fastify.server.unref()

    forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, _response, body) => {
      t.assert.ifError(err)
      t.assert.equal(body.toString(), 'B')
      done()
    })

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
  })
})

test('rss bytes', (t, done) => {
  t.plan(5)
  fastify.register(underPressure, {
    maxRssBytes: 1,
    pressureHandler: (_req, rep, type, value) => {
      t.assert.equal(type, underPressure.TYPE_RSS_BYTES)
      t.assert.ok(value > 1)
      rep.send('B')
    }
  })

  fastify.get('/', (_req, rep) => rep.send('A'))
  fastify.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
    t.assert.ifError(err)
    fastify.server.unref()

    forkRequest(address, monitorEventLoopDelay ? 750 : 250, (err, _response, body) => {
      t.assert.ifError(err)
      t.assert.equal(body.toString(), 'B')
      done()
    })

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
  })
})

test('event loop utilization', { skip: !isSupportedVersion }, (t, done) => {
  t.plan(5)
  fastify.register(underPressure, {
    maxEventLoopUtilization: 0.01,
    pressureHandler: (_req, rep, type, value) => {
      t.assert.equal(type, underPressure.TYPE_EVENT_LOOP_UTILIZATION)
      t.assert.ok(value > 0.01 && value <= 1)
      rep.send('B')
    }
  })

  fastify.get('/', async (_req, rep) => rep.send('A'))
  fastify.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
    t.assert.ifError(err)
    fastify.server.unref()

    forkRequest(address, 500, (err, _response, body) => {
      t.assert.ifError(err)
      t.assert.equal(body.toString(), 'B')
      done()
    })

    process.nextTick(() => block(1000))
  })
})

test('event loop delay (NaN)', { skip: !isSupportedVersion }, (t, done) => {
  t.plan(5)
  const mockedPerfHooks = {
    monitorEventLoopDelay: () => ({
      enable: () => { },
      reset: () => { },
      mean: NaN,
    }),
    performance: {
      eventLoopUtilization: () => { },
    },
  }

  const mockedUnderPressure = proxyquire('../index', {
    'node:perf_hooks': mockedPerfHooks,
  })

  fastify.register(mockedUnderPressure, {
    maxEventLoopDelay: 1000,
    pressureHandler: (_req, rep, type, value) => {
      t.assert.strictEqual(type, underPressure.TYPE_EVENT_LOOP_DELAY)
      t.assert.strictEqual(value, Infinity)
      rep.send('B')
    },
  })

  fastify.get('/', async (_req, rep) => rep.send('A'))

  fastify.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
    t.assert.ifError(err)
    fastify.server.unref()

    forkRequest(address, 500, (err, _response, body) => {
      t.assert.ifError(err)
      t.assert.strictEqual(body.toString(), 'B')
      done()
    })

    process.nextTick(() => block(1000))
  })
})

describe('pressureHandler on route', async () => {
  test('simple', async () => {
    await fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1
    })

    fastify.get('/', {
      config: {
        pressureHandler: (_req, rep, type, value) => {
          process._rawDebug('pressureHandler')
          assert.equal(type, underPressure.TYPE_HEALTH_CHECK)
          assert.equal(value, undefined)
          rep.send('B')
        }
      }
    }, (_req, rep) => rep.send('A'))

    assert.equal((await fastify.inject().get('/').end()).body, 'B')
  })

  test('delayed handling with promise success', async () => {
    fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1
    })

    fastify.get('/', {
      config: {
        pressureHandler: async (_req, rep, _type, _value) => {
          await wait(250)
          rep.send('B')
        }
      }
    }, (_req, rep) => rep.send('A'))

    assert.equal((await fastify.inject().get('/').end()).body, 'B')
  })

  test('delayed handling with promise error', async () => {
    const errorMessage = 'promiseError'

    fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1
    })

    fastify.get('/', {
      config: {
        pressureHandler: async (_req, _rep, _type, _value) => {
          await wait(250)
          throw new Error(errorMessage)
        }
      }
    }, (_req, rep) => rep.send('A'))

    const response = await fastify.inject().get('/').end()
    assert.equal(response.statusCode, 500)
    assert.equal(JSON.parse(response.body).message, errorMessage)
  })

  test('no handling', async () => {
    fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1
    })

    fastify.get('/', {
      config: {
        pressureHandler: (_req, _rep, _type, _value) => { }
      }
    }, (_req, rep) => rep.send('A'))

    assert.equal((await fastify.inject().get('/').end()).body, 'A')
  })

  test('return response', async () => {
    fastify.register(underPressure, {
      healthCheck: async () => false,
      healthCheckInterval: 1
    })

    fastify.get('/', {
      config: {
        pressureHandler: (_req, _rep, _type, _value) => 'B'
      }
    }, (_req, rep) => rep.send('A'))

    assert.equal((await fastify.inject().get('/').end()).body, 'B')
  })
})
