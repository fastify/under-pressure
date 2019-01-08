# under-pressure

[![Greenkeeper badge](https://badges.greenkeeper.io/fastify/under-pressure.svg)](https://greenkeeper.io/)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](http://standardjs.com/)
[![Build Status](https://travis-ci.org/fastify/under-pressure.svg?branch=master)](https://travis-ci.org/fastify/under-pressure)

Measure process load with automatic handling of *"Service Unavailable"* plugin for Fastify.  
It can check `maxEventLoopDelay`, `maxHeapUsedBytes` and `maxRssBytes` values.

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
  maxRssBytes: 100000000
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

The default value for `maxEventLoopDelay`, `maxHeapUsedBytes` and `maxRssBytes` is `0`.  
If the value is `0` the check will not be performed.

Thanks to the encapsulation model of Fastify, you can selectively use this plugin in some subset of routes or even with different thresholds in different plugins.

#### `memoryUsage`
This plugin also exposes a function that will tell you the current values of `heapUsed`, `rssBytes` and `eventLoopDelay`.
```js
console.log(fastify.memoryUsage())
```

#### Status route
If needed you can pass `{ exposeStatusRoute: true }` and `under-pressure` will expose a `/status` route for you that sends back a `{ status: 'ok' }` object. This can be useful if you need to attach the server to an ELB on AWS for example.

If you need the change the exposed route path, you can pass `{ exposeStatusRoute: '/alive' }` options.

<a name="acknowledgements"></a>
## Acknowledgements

This project is kindly sponsored by [LetzDoIt](http://www.letzdoitapp.com/).  

<a name="license"></a>
## License

Licensed under [MIT](./LICENSE).
