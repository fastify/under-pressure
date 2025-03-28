# @fastify/under-pressure

[![CI](https://github.com/fastify/under-pressure/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/fastify/under-pressure/actions/workflows/ci.yml)
[![NPM version](https://img.shields.io/npm/v/@fastify/under-pressure.svg?style=flat)](https://www.npmjs.com/package/@fastify/under-pressure)
[![neostandard javascript style](https://img.shields.io/badge/code_style-neostandard-brightgreen?style=flat)](https://github.com/neostandard/neostandard)

Process load measuring plugin for Fastify, with automatic handling of *"Service Unavailable"*.
It can check `maxEventLoopDelay`, `maxHeapUsedBytes`, `maxRssBytes`, and `maxEventLoopUtilization` values.
You can also specify a custom health check, to verify the status of
external resources.

<a name="install"></a>
## Install
```
npm i @fastify/under-pressure
```

### Compatibility
| Plugin version | Fastify version |
| ---------------|-----------------|
| `>=9.x`        | `^5.x`          |
| `>=6.x <9.x`   | `^4.x`          |
| `^5.x`         | `^3.x`          |
| `>=2.x <5.x`   | `^2.x`          |
| `^1.x`         | `^1.x`          |


Please note that if a Fastify version is out of support, then so are the corresponding versions of this plugin
in the table above.
See [Fastify's LTS policy](https://github.com/fastify/fastify/blob/main/docs/Reference/LTS.md) for more details.

<a name="usage"></a>
## Usage
Require the plugin and register it into the Fastify instance.

```js
const fastify = require('fastify')()

fastify.register(require('@fastify/under-pressure'), {
  maxEventLoopDelay: 1000,
  maxHeapUsedBytes: 100000000,
  maxRssBytes: 100000000,
  maxEventLoopUtilization:0.98
})

fastify.get('/', (request, reply) => {
  if (fastify.isUnderPressure()) {
    // skip complex computation
  }
  reply.send({ hello: 'world'})
})

fastify.listen({ port: 3000 }, err => {
  if (err) throw err
  console.log(`server listening on ${fastify.server.address().port}`)
})
```
`@fastify/under-pressure` will automatically handle for you the `Service Unavailable` error once one of the thresholds has been reached.
You can configure the error message and the `Retry-After` header.
```js
fastify.register(require('@fastify/under-pressure'), {
  maxEventLoopDelay: 1000,
  message: 'Under pressure!',
  retryAfter: 50
})
```

You can also configure custom Error instance `@fastify/under-pressure` will throw.
```js
class CustomError extends Error {
  constructor () {
    super('Custom error message')
    Error.captureStackTrace(this, CustomError)
  }
}

fastify.register(require('@fastify/under-pressure'), {
  maxEventLoopDelay: 1000,
  customError: CustomError
})
```

The default value for `maxEventLoopDelay`, `maxHeapUsedBytes`, `maxRssBytes`, and `maxEventLoopUtilization` is `0`.
If the value is `0` the check will not be performed.

Thanks to the encapsulation model of Fastify, you can selectively use this plugin in a subset of routes or even with different thresholds in different plugins.

#### `memoryUsage`
This plugin also exposes a function that will tell you the current values of `heapUsed`, `rssBytes`, `eventLoopDelay`, and `eventLoopUtilized`.
```js
console.log(fastify.memoryUsage())
```

#### Pressure Handler

You can provide a pressure handler in the options to handle the pressure errors. The advantage is that you know why the error occurred. Moreover, the request can be handled as if nothing happened.

```js
const fastify = require('fastify')()
const underPressure = require('@fastify/under-pressure')()

fastify.register(underPressure, {
  maxHeapUsedBytes: 100000000,
  maxRssBytes: 100000000,
  pressureHandler: (request, reply, type, value) => {
    if (type === underPressure.TYPE_HEAP_USED_BYTES) {
      fastify.log.warn(`too many heap bytes used: ${value}`)
    } else if (type === underPressure.TYPE_RSS_BYTES) {
      fastify.log.warn(`too many rss bytes used: ${value}`)
    }

    reply.send('out of memory') // if you omit this line, the request will be handled normally
  }
})
```

It is possible as well to return a Promise that will call `reply.send` (or something else).

```js
fastify.register(underPressure, {
  maxHeapUsedBytes: 100000000,
  pressureHandler: (request, reply, type, value) => {
    return getPromise().then(() => reply.send({ hello: 'world' }))
  }
})
```

Any other return value than a promise or nullish will be sent to the client with `reply.send`.

It's also possible to specify the `pressureHandler` on the route:

```js
const fastify = require('fastify')()
const underPressure = require('@fastify/under-pressure')()

fastify.register(underPressure, {
  maxHeapUsedBytes: 100000000,
  maxRssBytes: 100000000,
})

fastify.register(async function (fastify) {
  fastify.get('/', {
    config: {
      pressureHandler: (request, reply, type, value) => {
        if (type === underPressure.TYPE_HEAP_USED_BYTES) {
          fastify.log.warn(`too many heap bytes used: ${value}`)
        } else if (type === underPressure.TYPE_RSS_BYTES) {
          fastify.log.warn(`too many rss bytes used: ${value}`)
        }

        reply.send('out of memory') // if you omit this line, the request will be handled normally
      }
    }
  }, () => 'A')
})
```

#### Status route
If needed you can pass `{ exposeStatusRoute: true }` and `@fastify/under-pressure` will expose a `/status` route for you that sends back a `{ status: 'ok' }` object. This can be useful if you need to attach the server to an ELB on AWS for example.

If you need the change the exposed route path, you can pass `{ exposeStatusRoute: '/alive' }` options.

To configure the endpoint more specifically you can pass an object. This consists of

- *routeOpts* - Any Fastify [route options](https://fastify.dev/docs/latest/Reference/Routes/#routes-options) except `schema`
- *routeSchemaOpts* - As per the Fastify route options, an object containing the schema for request
- *routeResponseSchemaOpts* - An object containing the schema for additional response items to be merged with the default response schema, see below
- *url* - The URL to expose the status route on

```js
fastify.register(require('@fastify/under-pressure'), {
  maxEventLoopDelay: 1000,
  exposeStatusRoute: {
    routeOpts: {
      logLevel: 'debug',
      config: {
        someAttr: 'value'
      }
    },
    routeSchemaOpts: { // If you also want to set a custom route schema
      hide: true
    },
    url: '/alive' // If you also want to set a custom route path and pass options
  }
})
```
The above example will set the `logLevel` value for the `/alive` route to `debug`.

If you need to return other information in the response, you can return an object from the `healthCheck` function (see next paragraph) and use the `routeResponseSchemaOpts` property to describe your custom response schema (**note**: `status` will always be present in the response)

```js
fastify.register(underPressure, {
  ...
  exposeStatusRoute: {
    routeResponseSchemaOpts: {
      extraValue: { type: 'string' },
      metrics: {
        type: 'object',
        properties: {
          eventLoopDelay: { type: 'number' },
          rssBytes: { type: 'number' },
          heapUsed: { type: 'number' },
          eventLoopUtilized: { type: 'number' },
        },
      },
      // ...
    }
  },
  healthCheck: async (fastifyInstance) => {
    return {
      extraValue: await getExtraValue(),
      metrics: fastifyInstance.memoryUsage(),
      // ...
    }
  },
}
```

#### Custom health checks
If needed you can pass a custom `healthCheck` property, which is an async function, and `@fastify/under-pressure` will allow you to check the status of other components of your service.

This function should return a promise that resolves to a boolean value or an object. The `healthCheck` function can be called either:

* every X milliseconds, the time can be
  configured with the `healthCheckInterval` option.
* every time the status route is called, if `exposeStatusRoute` is set
  to `true`.

By default when this function is supplied your service health is considered unhealthy, until it has started to return true.

```js
const fastify = require('fastify')()

fastify.register(require('@fastify/under-pressure'), {
  healthCheck: async function (fastifyInstance) {
    // Do some magic to check if your db connection is healthy
    return true
  },
  healthCheckInterval: 500
})
```
<a name="sample-interval"></a>
#### Sample interval

You can set a custom value for sampling the metrics returned by `memoryUsage` using the `sampleInterval` option, which accepts a number that represents the interval in milliseconds.

The default value is different depending on which Node version is used. In version 8 and 10 it is `5`, while on version 11.10.0 and up it is `1000`. This difference is because from version 11.10.0 the event loop delay can be sampled with [`monitorEventLoopDelay`](https://nodejs.org/docs/latest-v12.x/api/perf_hooks.html#perf_hooks_perf_hooks_monitoreventloopdelay_options) and this allows an increase in the interval value.

```js
const fastify = require('fastify')()

fastify.register(require('@fastify/under-pressure'), {
  sampleInterval: <your custom sample interval in ms>
})
```

<a name="additional-information"></a>
## Additional information

<a name="set-timeout-vs-set-interval"></a>
#### `setTimeout` vs `setInterval`

Under the hood, `@fastify/under-pressure` uses the `setTimeout` method to perform its polling checks. The choice is based on the fact that we do not want to add additional pressure to the system.

In fact, it is known that `setInterval` will call repeatedly at the scheduled time regardless of whether the previous call ended or not, and if the server is already under load, this will likely increase the problem, because those `setInterval` calls will start piling up. `setTimeout`, on the other hand, is called only once and does not cause the mentioned problem.

One note to consider is that because the two methods are not identical, the timer function is not guaranteed to run at the same rate when the system is under pressure or running a long-running process.


<a name="acknowledgments"></a>
## Acknowledgments

This project is kindly sponsored by [LetzDoIt](https://www.letzdoitapp.com/).

<a name="license"></a>
## License

Licensed under [MIT](./LICENSE).
