# under-pressure

[![Build Status](https://img.shields.io/github/workflow/status/fastify/under-pressure/CI)](https://github.com/fastify/under-pressure/actions)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](http://standardjs.com/)

Measure process load with automatic handling of *"Service Unavailable"* plugin for Fastify.
It can check `maxEventLoopDelay`, `maxHeapUsedBytes`, `maxRssBytes` and `maxEventLoopUtilization` values.
You can also specify custom health check, to verify the status of
external resources.

<a name="requirements"></a>
## Requirements

Fastify ^2.0.0. Please refer to [this branch](https://github.com/fastify/under-pressure/tree/1.x) and related versions for Fastify ^1.1.0 compatibility.

<a name="install"></a>
## Install
```
npm i under-pressure --save
```

<a name="usage"></a>
## Usage
Require the plugin and register it into the Fastify instance.

```js
const fastify = require('fastify')()

fastify.register(require('under-pressure'), {
  maxEventLoopDelay: 1000,
  maxHeapUsedBytes: 100000000,
  maxRssBytes: 100000000,
  maxEventLoopUtilization:0.98
})

fastify.get('/', (req, reply) => {
  reply.send({ hello: 'world'})
})

fastify.listen(3000, err => {
  if (err) throw err
  console.log(`server listening on ${fastify.server.address().port}`)
})
```
`under-pressure` will automatically handle for you the `Service Unavailable` error once one of the thresholds has been reached.
You can configure the error message and the `Retry-After` header.
```js
fastify.register(require('under-pressure'), {
  maxEventLoopDelay: 1000,
  message: 'Under pressure!',
  retryAfter: 50
})
```

You can also configure custom Error instance `under-pressure` will throw.
```js
  class CustomError extends Error {
    constructor () {
      super('Custom error message')
      Error.captureStackTrace(this, CustomError)
    }
  }

  fastify.register(require('under-pressure'), {
  maxEventLoopDelay: 1000,
  customError: CustomError
})
```

The default value for `maxEventLoopDelay`, `maxHeapUsedBytes`, `maxRssBytes` and `maxEventLoopUtilization` is `0`.
If the value is `0` the check will not be performed.

Since [`eventLoopUtilization`](https://nodejs.org/api/perf_hooks.html#perf_hooks_performance_eventlooputilization_utilization1_utilization2) is only available in Node version 14.0.0 and 12.19.0 the check will be disbaled in other versions.

Thanks to the encapsulation model of Fastify, you can selectively use this plugin in some subset of routes or even with different thresholds in different plugins.

#### `memoryUsage`
This plugin also exposes a function that will tell you the current values of `heapUsed`, `rssBytes`, `eventLoopDelay` and `eventLoopUtilized`.
```js
console.log(fastify.memoryUsage())
```

#### Status route
If needed you can pass `{ exposeStatusRoute: true }` and `under-pressure` will expose a `/status` route for you that sends back a `{ status: 'ok' }` object. This can be useful if you need to attach the server to an ELB on AWS for example.

If you need the change the exposed route path, you can pass `{ exposeStatusRoute: '/alive' }` options.

If you need to pass options to the status route, such as logLevel or custom configuration you can pass an object,
```js
fastify.register(require('under-pressure'), {
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
The above example will set the `logLevel` value for the `/status` route be `debug`.

If you need to return other information in the response, you can return an object from the `healthCheck` function (see next paragraph) and use the `routeResponseSchemaOpts` property to describe your custom response schema (**note**: `status` will always be present in the response)

```js
fastify.register(underPressure, {
  ...
  exposeStatusRoute: {
    routeResponseSchemaOpts: {
      extraValue: { type: 'string' },
      // ...
    }
  },
  healthCheck: async () => {
    return {
      extraValue: await getExtraValue(),
      // ...
    }
  },
}
```

#### Custom health checks
If needed you can pass a custom `healthCheck` property which is an async function and `under-pressure` will allow you to check the status of other components of your service.

This function should return a promise which resolves to a boolean value or to an object. The `healthCheck` function can be called either:

* every X milliseconds, the time can be
  configured with the `healthCheckInterval` option.
* every time the status route is called, if `exposeStatusRoute` is set
  to `true`.

By default when this function is supplied your service health is considered unhealthy, until it has started to return true.

```js
const fastify = require('fastify')()

fastify.register(require('under-pressure'), {
  healthCheck: async function () {
    // do some magic to check if your db connection is healthy, etc...
    return true
  },
  healthCheckInterval: 500
})
```
<a name="sample-interval"></a>
#### Sample interval

You can set a custom value for sampling the metrics returned by `memoryUsage` using the `sampleInterval` option, which accepts a number that represents the interval in milliseconds.

The default value is different depending on which Node version is used. On version 8 and 10 it is `5`, while on version 11.10.0 and up it is `1000`. This difference is due to the fact that from version 11.10.0 the event loop delay can be sampled with [`monitorEventLoopDelay`](https://nodejs.org/docs/latest-v12.x/api/perf_hooks.html#perf_hooks_perf_hooks_monitoreventloopdelay_options) and this allows to increase the interval value.

```js
const fastify = require('fastify')()

fastify.register(require('under-pressure'), {
  sampleInterval: <your custom sample interval in ms>
})


```

<a name="acknowledgements"></a>
## Acknowledgements

This project is kindly sponsored by [LetzDoIt](http://www.letzdoitapp.com/).

<a name="license"></a>
## License

Licensed under [MIT](./LICENSE).
