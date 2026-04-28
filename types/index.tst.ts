import fastifyUnderPressure, { fastifyUnderPressure as namedFastifyUnderPressure, TYPE_EVENT_LOOP_DELAY, TYPE_EVENT_LOOP_UTILIZATION, TYPE_HEALTH_CHECK, TYPE_HEAP_USED_BYTES, TYPE_RSS_BYTES } from '.'
import fastify from 'fastify'
import { expect } from 'tstyche'

{
  const server = fastify()
  server.register(fastifyUnderPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 100000000,
    maxRssBytes: 100000000
  })

  server.register(fastifyUnderPressure)

  server.get('/', (_req, reply) => {
    reply.send({ hello: 'world', underPressure: server.isUnderPressure() })
  })

  server.listen({ port: 3000 }, err => {
    if (err) throw err
  })
};

{
  const server = fastify()
  server.register(fastifyUnderPressure, {
    maxEventLoopDelay: 1000,
    message: 'Under pressure!',
    retryAfter: 50
  })
};

{
  const server = fastify()
  const memoryUsage = server.memoryUsage()
  console.log(memoryUsage.heapUsed)
  console.log(memoryUsage.rssBytes)
  console.log(memoryUsage.eventLoopDelay)
};

{
  const server = fastify()
  server.register(fastifyUnderPressure, {
    healthCheck: async function (fastifyInstance) {
      // do some magic to check if your db connection is healthy, etc...
      return fastifyInstance.register === server.register
    },
    healthCheckInterval: 500
  })
};

{
  const server = fastify()
  server.register(fastifyUnderPressure, {
    sampleInterval: 10
  })
}

{
  const server = fastify()
  server.register(fastifyUnderPressure, {
    exposeStatusRoute: '/v2/status',
  })

  server.register(fastifyUnderPressure, {
    exposeStatusRoute: true
  })

  server.register(fastifyUnderPressure, {
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'silent',
        config: {}
      },
      url: '/alive'
    }
  })

  server.register(fastifyUnderPressure, {
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'silent'
      }
    }
  })

  server.register(fastifyUnderPressure, {
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'silent'
      },
      routeSchemaOpts: {
        hide: true
      }
    }
  })

  server.register(fastifyUnderPressure, {
    customError: new Error('custom error message')
  })

  class CustomError extends Error {
    constructor () {
      super('Custom error message')
      Error.captureStackTrace(this, CustomError)
    }
  }

  server.register(fastifyUnderPressure, {
    customError: CustomError
  })
}

expect(fastifyUnderPressure.TYPE_EVENT_LOOP_DELAY).type.toBe<'eventLoopDelay'>()
expect(fastifyUnderPressure.TYPE_HEAP_USED_BYTES).type.toBe<'heapUsedBytes'>()
expect(fastifyUnderPressure.TYPE_RSS_BYTES).type.toBe<'rssBytes'>()
expect(fastifyUnderPressure.TYPE_HEALTH_CHECK).type.toBe<'healthCheck'>()
expect(fastifyUnderPressure.TYPE_EVENT_LOOP_UTILIZATION).type.toBe<'eventLoopUtilization'>()

expect(namedFastifyUnderPressure.TYPE_EVENT_LOOP_DELAY).type.toBe<'eventLoopDelay'>()
expect(namedFastifyUnderPressure.TYPE_HEAP_USED_BYTES).type.toBe<'heapUsedBytes'>()
expect(namedFastifyUnderPressure.TYPE_RSS_BYTES).type.toBe<'rssBytes'>()
expect(namedFastifyUnderPressure.TYPE_HEALTH_CHECK).type.toBe<'healthCheck'>()
expect(namedFastifyUnderPressure.TYPE_EVENT_LOOP_UTILIZATION).type.toBe<'eventLoopUtilization'>()

expect(TYPE_EVENT_LOOP_DELAY).type.toBe<'eventLoopDelay'>()
expect(TYPE_HEAP_USED_BYTES).type.toBe<'heapUsedBytes'>()
expect(TYPE_RSS_BYTES).type.toBe<'rssBytes'>()
expect(TYPE_HEALTH_CHECK).type.toBe<'healthCheck'>()
expect(TYPE_EVENT_LOOP_UTILIZATION).type.toBe<'eventLoopUtilization'>()
