import underPressure from ".";
import fastify from "fastify";

const server = fastify();

() => {
  server.register(underPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 100000000,
    maxRssBytes: 100000000
  });

  server.register(underPressure);

  server.get("/", (req, reply) => {
    reply.send({ hello: "world" });
  });

  server.listen(3000, err => {
    if (err) throw err;
  });
};

() => {
  server.register(underPressure, {
    maxEventLoopDelay: 1000,
    message: "Under pressure!",
    retryAfter: 50
  });
};

() => {
  console.log(server.memoryUsage());
};

() => {
  server.register(underPressure, {
    healthCheck: async function () {
      // do some magic to check if your db connection is healthy, etc...
      return true;
    },
    healthCheckInterval: 500
  });
};

() => {
  server.register(underPressure, {
    sampleInterval: 10
  });
}

() => {
  server.register(underPressure, {
    exposeStatusRoute: '/v2/status',
  });

  server.register(underPressure, {
    exposeStatusRoute: true
  });

  server.register(underPressure, {
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'silent',
        config: {}
      },
      url: '/alive'
    }
  });

  server.register(underPressure, {
    exposeStatusRoute: {
      routeOpts: {
        logLevel: 'silent'
      }
    }
  });

  server.register(underPressure, {
    customError: new Error('custom error message')
  });
};

