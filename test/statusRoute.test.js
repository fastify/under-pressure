'use strict'

const { test, afterEach } = require('node:test')
const assert = require('node:assert')
const forkRequest = require('./forkRequest')
const Fastify = require('fastify')
const { monitorEventLoopDelay } = require('node:perf_hooks')
const underPressure = require('../index')

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

test('Expose status route', async (t) => {
  const fastify = Fastify()
  fastify.register(underPressure, {
    exposeStatusRoute: true,
  })

  await new Promise((resolve, reject) => {
    fastify.listen({ port: 0 }, (err, address) => {
      if (err) {
        return reject(err)
      }
      fastify.server.unref()

      forkRequest(
        `${address}/status`,
        monitorEventLoopDelay ? 750 : 250,
        (err, response, body) => {
          if (err) {
            return reject(err)
          }
          assert.equal(response.statusCode, 200)
          assert.deepStrictEqual(JSON.parse(body), { status: 'ok' })
          resolve()
        }
      )

      process.nextTick(() => block(monitorEventLoopDelay ? 1500 : 500))
    })
  })
})

test('Expose custom status route', (t) => {
  const fastify = Fastify()

  fastify.register(underPressure, {
    exposeStatusRoute: '/alive',
  })

  fastify.inject(
    {
      url: '/status',
    },
    (err, response) => {
      assert.ifError(err)
      assert.equal(response.statusCode, 404)
    }
  )

  fastify.inject(
    {
      url: '/alive',
    },
    (err, response) => {
      assert.ifError(err)
      assert.equal(response.statusCode, 200)
      assert.deepStrictEqual(JSON.parse(response.payload), { status: 'ok' })
    }
  )
})

test('Expose status route with additional route options', async () => {
  const customConfig = {
    customVal: 'someVal',
  }
  const fastify = Fastify({ exposeHeadRoutes: false })

  fastify.addHook('onRoute', async (routeOptions) => {
    fastify.server.unref()
    process.nextTick(() => block(500))
    assert.equal(routeOptions.url, '/alive')
    assert.equal(routeOptions.logLevel, 'silent', 'log level not set')
    assert.strictEqual(routeOptions.config, customConfig, 'config not set')
  })

  fastify.register(underPressure, {
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'silent',
        config: customConfig,
      },
      url: '/alive',
    },
  })

  await fastify.ready()
})

test('Expose status route with additional route options and default url', async () => {
  const fastify = Fastify({ exposeHeadRoutes: false })

  fastify.addHook('onRoute', (routeOptions) => {
    fastify.server.unref()
    process.nextTick(() => block(500))
    assert.equal(routeOptions.url, '/status')
    assert.equal(routeOptions.logLevel, 'silent', 'log level not set')
  })

  fastify.register(underPressure, {
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'silent',
      },
    },
  })

  await fastify.ready()
})

test('Expose status route with additional route options, route schema options', async () => {
  const routeSchemaOpts = { hide: true }

  const fastify = Fastify({ exposeHeadRoutes: false })

  fastify.addHook('onRoute', (routeOptions) => {
    fastify.server.unref()
    process.nextTick(() => block(500))
    assert.equal(routeOptions.url, '/alive')
    assert.equal(routeOptions.logLevel, 'silent', 'log level not set')
    assert.deepStrictEqual(
      routeOptions.schema,
      Object.assign({}, routeSchemaOpts, {
        response: {
          200: {
            type: 'object',
            description: 'Health Check Succeeded',
            properties: {
              status: { type: 'string' },
            },
            example: {
              status: 'ok',
            },
          },
          500: {
            type: 'object',
            description: 'Error Performing Health Check',
            properties: {
              message: {
                type: 'string',
                description: 'Error message for failure during health check',
                example: 'Internal Server Error',
              },
              statusCode: {
                type: 'number',
                description:
                  'Code representing the error. Always matches the HTTP response code.',
                example: 500,
              },
            },
          },
          503: {
            type: 'object',
            description: 'Health Check Failed',
            properties: {
              code: {
                type: 'string',
                description: 'Error code associated with the failing check',
                example: 'FST_UNDER_PRESSURE',
              },
              error: {
                type: 'string',
                description: 'Error thrown during health check',
                example: 'Service Unavailable',
              },
              message: {
                type: 'string',
                description: 'Error message to explain health check failure',
                example: 'Service Unavailable',
              },
              statusCode: {
                type: 'number',
                description:
                  'Code representing the error. Always matches the HTTP response code.',
                example: 503,
              },
            },
          },
        },
      }),
      'config not set'
    )
  })

  fastify.register(underPressure, {
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'silent',
      },
      routeSchemaOpts,
      url: '/alive',
    },
  })

  await fastify.ready()
})

test('Expose status route with additional route options, route schema options and default url', async () => {
  const routeSchemaOpts = { hide: true }

  const fastify = Fastify({ exposeHeadRoutes: false })

  fastify.addHook('onRoute', (routeOptions) => {
    fastify.server.unref()
    process.nextTick(() => block(500))
    assert.equal(routeOptions.url, '/status')
    assert.equal(routeOptions.logLevel, 'silent', 'log level not set')
    assert.deepStrictEqual(
      routeOptions.schema,
      Object.assign({}, routeSchemaOpts, {
        response: {
          200: {
            type: 'object',
            description: 'Health Check Succeeded',
            properties: {
              status: { type: 'string' },
            },
            example: {
              status: 'ok',
            },
          },
          500: {
            type: 'object',
            description: 'Error Performing Health Check',
            properties: {
              message: {
                type: 'string',
                description: 'Error message for failure during health check',
                example: 'Internal Server Error',
              },
              statusCode: {
                type: 'number',
                description:
                  'Code representing the error. Always matches the HTTP response code.',
                example: 500,
              },
            },
          },
          503: {
            type: 'object',
            description: 'Health Check Failed',
            properties: {
              code: {
                type: 'string',
                description: 'Error code associated with the failing check',
                example: 'FST_UNDER_PRESSURE',
              },
              error: {
                type: 'string',
                description: 'Error thrown during health check',
                example: 'Service Unavailable',
              },
              message: {
                type: 'string',
                description: 'Error message to explain health check failure',
                example: 'Service Unavailable',
              },
              statusCode: {
                type: 'number',
                description:
                  'Code representing the error. Always matches the HTTP response code.',
                example: 503,
              },
            },
          },
        },
      }),
      'config not set'
    )
  })

  fastify.register(underPressure, {
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'silent',
      },
      routeSchemaOpts,
    },
  })

  await fastify.ready()
})
