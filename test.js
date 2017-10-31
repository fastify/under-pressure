'use strict'

const t = require('tap')
const test = t.test
const sget = require('simple-get').concat
const Fastify = require('fastify')
const underPressure = require('./index')

test('Should return 503', t => {
  t.plan(5)

  const fastify = Fastify()
  fastify.register(underPressure)

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

test('Custom options', t => {
  t.plan(5)

  const fastify = Fastify()
  fastify.register(underPressure, {
    maxEventLoopDelay: {
      limit: 10,
      retryAfter: 50,
      message: 'Under pressure!'
    }
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

function sleep (msec) {
  const start = Date.now()
  while (Date.now() - start < msec) {}
}
