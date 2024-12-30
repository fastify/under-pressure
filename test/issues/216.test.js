const { test } = require('tap')
const Fastify = require('fastify')
const underPressure = require('../../index')

test('should be unhealthy if healthCheck throws an error', async t => {
  t.plan(4)

  const app = Fastify()
  app.register(underPressure, {
    healthCheck: async () => { throw new Error('Kaboom!') },
    healthCheckInterval: 1000,
    exposeStatusRoute: true,
    pressureHandler: (_req, rep, type) => {
      t.equal(type, underPressure.TYPE_HEALTH_CHECK)
      rep.status(503).send('unhealthy')
    }
  })

  await app.ready()
  t.ok(app.isUnderPressure())

  const response = await app.inject({
    method: 'GET',
    url: '/status'
  })

  t.equal(response.statusCode, 503)
  t.equal(response.body, 'unhealthy')

  await app.close()
})
