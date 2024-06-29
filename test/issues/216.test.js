const { test } = require('tap')
const Fastify = require('fastify')
const underPressure = require('../../index')

test('onRequest should call next if no pression to handle', async t => {
  t.plan(1)

  const app = Fastify()
  app.register(underPressure, {
    maxEventLoopDelay: 1000,
    exposeStatusRoute: true
  })

  await app.ready()

  const response = await app.inject({
    method: 'GET',
    url: '/status'
  })

  t.equal(response.statusCode, 200)

  await app.close()
})

test('should be unhealthy if healthCheck throws an error', async t => {
  t.plan(4)

  const app = Fastify()
  app.register(underPressure, {
    healthCheck: async () => { throw new Error('Kaboom!') },
    healthCheckInterval: 1000,
    exposeStatusRoute: true,
    pressureHandler: (req, rep, type) => {
      t.equal(type, underPressure.TYPE_HEALTH_CHECK)
      rep.status(503).send('unhealthy')
    }
  })

  await app.ready()
  t.ok(app.isUnderPressure(), 'App should be under pressure due to failed health check')

  const response = await app.inject({
    method: 'GET',
    url: '/status'
  })

  t.equal(response.statusCode, 503)
  t.equal(response.body, 'unhealthy')

  await app.close()
})

test('should work if pressureHandler is not a function', async t => {
  t.plan(2)

  const app = Fastify()
  app.register(underPressure, {
    healthCheck: async () => { throw new Error('Kaboom!') },
    healthCheckInterval: 1000,
    exposeStatusRoute: true,
    pressureHandler: {}
  })

  await app.ready()

  const response = await app.inject({
    method: 'GET',
    url: '/status'
  })

  console.log(response.headers)
  t.equal(response.statusCode, 503)
  t.equal(response.headers['retry-after'], '10')

  await app.close()
})
