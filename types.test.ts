import underPressure = require("../under-pressure");
import fastifyLib = require("fastify");

/*-------
| Usage |
-------*/

const fastify = fastifyLib();

() => {
  fastify.register(underPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 100000000,
    maxRssBytes: 100000000
  });

  fastify.register(underPressure);

  fastify.get("/", (req, reply) => {
    reply.send({ hello: "world" });
  });

  fastify.listen(3000, err => {
    if (err) throw err;
  });
};

() => {
  fastify.register(underPressure, {
    maxEventLoopDelay: 1000,
    message: "Under pressure!",
    retryAfter: 50
  });
};

() => {
  console.log(fastify.memoryUsage());
};

() => {
  fastify.register(underPressure, {
    healthCheck: async function() {
      // do some magic to check if your db connection is healthy, etc...
      return true;
    },
    healthCheckInterval: 500
  });
};
