'use strict'

const { test, afterEach } = require('node:test')
const assert = require('node:assert')
const Fastify = require('fastify')
const underPressure = require('../../index')

let app

afterEach(async () => {
  if (app) {
    await app.close()
    app = undefined
  }
})

test('should be unhealthy if healthCheck throws an error', async (t) => {
  app = Fastify()
  app.register(underPressure, {
    healthCheck: async () => {
      throw new Error('Kaboom!')
    },
    healthCheckInterval: 1000,
    exposeStatusRoute: true,
    pressureHandler: (_req, rep, type) => {
      assert.strictEqual(type, underPressure.TYPE_HEALTH_CHECK)
      rep.status(503).send('unhealthy')
    },
  })

  await app.ready()
  assert.ok(app.isUnderPressure())

  const response = await app.inject({
    method: 'GET',
    url: '/status',
  })

  assert.strictEqual(response.statusCode, 503)
  assert.strictEqual(response.body, 'unhealthy')
})
