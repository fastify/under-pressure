import fastifyUnderPressure, { fastifyUnderPressure as namedFastifyUnderPressure, TYPE_EVENT_LOOP_DELAY, TYPE_EVENT_LOOP_UTILIZATION, TYPE_HEALTH_CHECK, TYPE_HEAP_USED_BYTES, TYPE_RSS_BYTES } from "..";
import fastify from "fastify";
import { expectType } from "tsd";

const server = fastify();

() => {
  server.register(fastifyUnderPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 100000000,
    maxRssBytes: 100000000
  });

  server.register(fastifyUnderPressure);

  server.get("/", (req, reply) => {

    reply.send({ hello: "world", underPressure: server.isUnderPressure() });
  });

  server.listen({port: 3000}, err => {
    if (err) throw err;
  });
};

() => {
  server.register(fastifyUnderPressure, {
    maxEventLoopDelay: 1000,
    message: "Under pressure!",
    retryAfter: 50
  });
};

() => {
  const memoryUsage = server.memoryUsage();
  console.log(memoryUsage.heapUsed);
  console.log(memoryUsage.rssBytes);
  console.log(memoryUsage.eventLoopDelay);
};

() => {
  server.register(fastifyUnderPressure, {
    healthCheck: async function (fastifyInstance) {
      // do some magic to check if your db connection is healthy, etc...
      return fastifyInstance.register === server.register;
    },
    healthCheckInterval: 500
  });
};

() => {
  server.register(fastifyUnderPressure, {
    sampleInterval: 10
  });
}

() => {
  server.register(fastifyUnderPressure, {
    exposeStatusRoute: '/v2/status',
  });

  server.register(fastifyUnderPressure, {
    exposeStatusRoute: true
  });

  server.register(fastifyUnderPressure, {
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'silent',
        config: {}
      },
      url: '/alive'
    }
  });

  server.register(fastifyUnderPressure, {
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'silent'
      }
    }
  });

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
  });
};

expectType<'eventLoopDelay'>(fastifyUnderPressure.TYPE_EVENT_LOOP_DELAY)
expectType<'heapUsedBytes'>(fastifyUnderPressure.TYPE_HEAP_USED_BYTES)
expectType<'rssBytes'>(fastifyUnderPressure.TYPE_RSS_BYTES)
expectType<'healthCheck'>(fastifyUnderPressure.TYPE_HEALTH_CHECK)
expectType<'eventLoopUtilization'>(fastifyUnderPressure.TYPE_EVENT_LOOP_UTILIZATION)

expectType<'eventLoopDelay'>(namedFastifyUnderPressure.TYPE_EVENT_LOOP_DELAY)
expectType<'heapUsedBytes'>(namedFastifyUnderPressure.TYPE_HEAP_USED_BYTES)
expectType<'rssBytes'>(namedFastifyUnderPressure.TYPE_RSS_BYTES)
expectType<'healthCheck'>(namedFastifyUnderPressure.TYPE_HEALTH_CHECK)
expectType<'eventLoopUtilization'>(namedFastifyUnderPressure.TYPE_EVENT_LOOP_UTILIZATION)

expectType<'eventLoopDelay'>(TYPE_EVENT_LOOP_DELAY)
expectType<'heapUsedBytes'>(TYPE_HEAP_USED_BYTES)
expectType<'rssBytes'>(TYPE_RSS_BYTES)
expectType<'healthCheck'>(TYPE_HEALTH_CHECK)
expectType<'eventLoopUtilization'>(TYPE_EVENT_LOOP_UTILIZATION)

