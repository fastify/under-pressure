'use strict'

const { test } = require('tap')
const { promisify } = require('util')
const sget = require('simple-get').concat
const Fastify = require('fastify')
const { monitorEventLoopDelay } = require('perf_hooks')
const underPressure = require('../index')
const { valid, satisfies, coerce } = require('semver')

const wait = promisify(setTimeout)
const isSupportedVersion = satisfies(valid(coerce(process.version)), '12.19.0 || >=14.0.0')

function block (msec) {
  const start = Date.now()
  /* eslint-disable no-empty */
  while (Date.now() - start < msec) { }
}

test('health check', async t => {
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

test('health check - delayed handling with promise success', async t => {
  t.plan(1)
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

test('health check - delayed handling with promise error', async t => {
  t.plan(2)
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

test('health check - no handling', async t => {
  t.plan(1)
  const fastify = Fastify()

  fastify.register(underPressure, {
    healthCheck: async () => false,
    healthCheckInterval: 1,
    pressureHandler: (req, rep, type, value) => { }
  })

  fastify.get('/', (req, rep) => rep.send('A'))

  t.equal((await fastify.inject().get('/').end()).body, 'A')
})

test('health check - return response', async t => {
  t.plan(1)
  const fastify = Fastify()

  fastify.register(underPressure, {
    healthCheck: async () => false,
    healthCheckInterval: 1,
    pressureHandler: (req, rep, type, value) => 'B'
  })

  fastify.get('/', (req, rep) => rep.send('A'))

  t.equal((await fastify.inject().get('/').end()).body, 'B')
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

  fastify.listen(0, async (err, address) => {
    t.error(err)
    fastify.server.unref()

    await wait(500)
    process.nextTick(() => block(1500))

    sget({
      method: 'GET',
      url: address + '/'
    }, (err, response, body) => {
      t.error(err)
      t.equal(body.toString(), 'B')
      fastify.close()
    })
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

  fastify.listen(0, (err, address) => {
    t.error(err)
    fastify.server.unref()

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))

    sget({
      method: 'GET',
      url: address
    }, (err, response, body) => {
      t.error(err)
      t.equal(body.toString(), 'B')
      fastify.close()
    })
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

  fastify.listen(0, (err, address) => {
    t.error(err)
    fastify.server.unref()

    process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))

    sget({
      method: 'GET',
      url: address
    }, (err, response, body) => {
      t.error(err)
      t.equal(body.toString(), 'B')
      fastify.close()
    })
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

  fastify.listen(0, (err, address) => {
    t.error(err)
    fastify.server.unref()

    process.nextTick(() => block(1000))

    sget({
      method: 'GET',
      url: address
    }, (err, response, body) => {
      t.error(err)
      t.equal(body.toString(), 'B')
      fastify.close()
    })
  })
})
