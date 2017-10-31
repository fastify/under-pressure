'use strict'

const t = require('tap')
const test = t.test
const sget = require('simple-get').concat
const Fastify = require('fastify')
const underPressure = require('./index')

test('Should return 503 on maxEventLoopDelay', t => {
  t.plan(5)

  const fastify = Fastify()
  fastify.register(underPressure, {
    maxEventLoopDelay: 50
  })

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen(0, err => {
    t.error(err)

    process.nextTick(() => sleep(500))
    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port
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

  fastify.listen(0, err => {
    t.error(err)

    process.nextTick(() => sleep(500))
    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port
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

  fastify.listen(0, err => {
    t.error(err)

    process.nextTick(() => sleep(500))
    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port
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
    maxEventLoopDelay: 50,
    message: 'Under pressure!',
    retryAfter: 50
  })

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen(0, err => {
    t.error(err)

    process.nextTick(() => sleep(500))
    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port
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

  fastify.listen(0, err => {
    t.error(err)
    t.is(typeof fastify.memoryUsage, 'function')

    process.nextTick(() => sleep(500))
    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.deepEqual(JSON.parse(body), { hello: 'world' })
      fastify.close()
    })
  })
})

function sleep (msec) {
  const start = Date.now()
  while (Date.now() - start < msec) {}
}
