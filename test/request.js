'use strict'

const sget = require('simple-get').concat
const promisify = require('node:util').promisify
const wait = promisify(setTimeout)

const address = process.argv[2]
const delay = parseInt(process.argv[3])

// custom stringification to avoid circular reference breaking
function stringifyResponse (response) {
  return JSON.stringify({
    statusCode: response.statusCode,
    headers: response.headers
  })
}

async function run () {
  await wait(delay)
  sget({
    method: 'GET',
    url: address
  }, function (error, response, body) {
    if (error instanceof Error) {
      process.send({
        error: error.message,
        response: stringifyResponse(response),
        body: body.toString()
      })
      process.exit(1)
    }

    process.send({
      error: null,
      response: stringifyResponse(response),
      body: body.toString()
    })
    process.exit()
  })
}

run()
