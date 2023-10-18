'use strict'

const fork = require('node:child_process').fork
const resolve = require('node:path').resolve

module.exports = function forkRequest (address, delay = 100, cb) {
  const childProcess = fork(
    resolve(__dirname, 'request.js'),
    [address, delay],
    { windowsHide: true }
  )

  childProcess.on('message', (payload) => {
    if (payload.error) {
      cb(new Error(payload.error), JSON.parse(payload.response), payload.body)
      return
    }
    cb(null, JSON.parse(payload.response), payload.body)
  })
  childProcess.on('error', err => {
    cb(err)
  })
}
