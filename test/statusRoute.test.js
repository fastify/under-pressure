'use strict'

const { test } = require('tap')
const sget = require('simple-get').concat
const Fastify = require('fastify')
const { monitorEventLoopDelay } = require('perf_hooks')
const underPressure = require('../index')

function block (msec) {
  const start = Date.now()
  /* eslint-disable no-empty */
  while (Date.now() - start < msec) { }
}

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
      t.equal(response.statusCode, 200)
      t.same(JSON.parse(body), { status: 'ok' })
      fastify.close()
    })
  })
})

test('Expose custom status route', t => {
  t.plan(5)

  const fastify = Fastify()
  t.teardown(() => fastify.close())

  fastify.register(underPressure, {
    exposeStatusRoute: '/alive'
  })

  fastify.inject({
    url: '/status'
  }, (err, response) => {
    t.error(err)
    t.equal(response.statusCode, 404)
  })

  fastify.inject({
    url: '/alive'
  }, (err, response) => {
    t.error(err)
    t.equal(response.statusCode, 200)
    t.same(JSON.parse(response.payload), { status: 'ok' })
  })
})

test('Expose status route with additional route options', t => {
  t.plan(3)

  const customConfig = {
    customVal: 'someVal'
  }
  const fastify = Fastify()

  fastify.addHook('onRoute', (routeOptions) => {
    fastify.server.unref()
    process.nextTick(() => block(500))
    t.equal(routeOptions.url, '/alive')
    t.equal(routeOptions.logLevel, 'silent', 'log level not set')
    t.same(routeOptions.config, customConfig, 'config not set')
    fastify.close()
  })

  fastify.register(underPressure, {
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'silent',
        config: customConfig
      },
      url: '/alive'
    }
  })

  fastify.ready()
})

test('Expose status route with additional route options and default url', t => {
  t.plan(2)

  const fastify = Fastify()

  fastify.addHook('onRoute', (routeOptions) => {
    fastify.server.unref()
    process.nextTick(() => block(500))
    t.equal(routeOptions.url, '/status')
    t.equal(routeOptions.logLevel, 'silent', 'log level not set')
    fastify.close()
  })

  fastify.register(underPressure, {
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'silent'
      }
    }
  })

  fastify.ready()
})

test('Expose status route with additional route options, route schema options', t => {
  const routeSchemaOpts = { hide: true }

  const fastify = Fastify()

  fastify.addHook('onRoute', (routeOptions) => {
    fastify.server.unref()
    process.nextTick(() => block(500))
    t.equal(routeOptions.url, '/alive')
    t.equal(routeOptions.logLevel, 'silent', 'log level not set')
    t.same(routeOptions.schema, Object.assign({}, routeSchemaOpts, {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' }
          }
        }
      }
    }), 'config not set')
    fastify.close()
    t.end()
  })

  fastify.register(underPressure, {
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'silent'
      },
      routeSchemaOpts,
      url: '/alive'
    }
  })

  fastify.ready()
})

test('Expose status route with additional route options, route schema options and default url', t => {
  const routeSchemaOpts = { hide: true }

  const fastify = Fastify()

  fastify.addHook('onRoute', (routeOptions) => {
    fastify.server.unref()
    process.nextTick(() => block(500))
    t.equal(routeOptions.url, '/status')
    t.equal(routeOptions.logLevel, 'silent', 'log level not set')
    t.same(routeOptions.schema, Object.assign({}, routeSchemaOpts, {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' }
          }
        }
      }
    }), 'config not set')
    fastify.close()
    t.end()
  })

  fastify.register(underPressure, {
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'silent'
      },
      routeSchemaOpts
    }
  })

  fastify.ready()
})
