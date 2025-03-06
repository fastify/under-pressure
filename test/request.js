'use strict'

const promisify = require('node:util').promisify
const wait = promisify(setTimeout)

const address = process.argv[2]
const delay = parseInt(process.argv[3])

// custom stringification to avoid circular reference breaking
function stringifyResponse (response) {
  return JSON.stringify({
    statusCode: response.status,
    headers: Object.fromEntries(response.headers)
  })
}

async function run () {
  await wait(delay)

  try {
    const result = await fetch(address)

    process.send({
      error: null,
      response: stringifyResponse(result),
      body: await result.text()
    })

    process.exit()
  } catch (result) {
    process.send({
      error: result.statusText,
      response: stringifyResponse(result),
      body: ''
    })
    process.exit(1)
  }
}

run()
