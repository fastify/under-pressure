'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fastifyUnderPressure = require('..')
const { TYPE_EVENT_LOOP_DELAY, TYPE_EVENT_LOOP_UTILIZATION, TYPE_HEALTH_CHECK, TYPE_HEAP_USED_BYTES, TYPE_RSS_BYTES } = require('..')

test('module.exports', async (t) => {
  assert.strictEqual(typeof fastifyUnderPressure.default, 'function')
  assert.strictEqual(typeof fastifyUnderPressure.fastifyUnderPressure, 'function')
  assert.strictEqual(fastifyUnderPressure.fastifyUnderPressure.name, 'fastifyUnderPressure')
  assert.strictEqual(fastifyUnderPressure.fastifyUnderPressure, fastifyUnderPressure.fastifyUnderPressure.fastifyUnderPressure)
  assert.strictEqual(fastifyUnderPressure.fastifyUnderPressure.default, fastifyUnderPressure.fastifyUnderPressure.fastifyUnderPressure)

  assert.strictEqual(TYPE_EVENT_LOOP_DELAY, 'eventLoopDelay')
  assert.strictEqual(TYPE_EVENT_LOOP_UTILIZATION, 'eventLoopUtilization')
  assert.strictEqual(TYPE_HEALTH_CHECK, 'healthCheck')
  assert.strictEqual(TYPE_HEAP_USED_BYTES, 'heapUsedBytes')
  assert.strictEqual(TYPE_RSS_BYTES, 'rssBytes')

  assert.strictEqual(fastifyUnderPressure.TYPE_RSS_BYTES, 'rssBytes')
  assert.strictEqual(fastifyUnderPressure.TYPE_EVENT_LOOP_DELAY, 'eventLoopDelay')
  assert.strictEqual(fastifyUnderPressure.TYPE_EVENT_LOOP_UTILIZATION, 'eventLoopUtilization')
  assert.strictEqual(fastifyUnderPressure.TYPE_HEALTH_CHECK, 'healthCheck')
  assert.strictEqual(fastifyUnderPressure.TYPE_HEAP_USED_BYTES, 'heapUsedBytes')

  assert.strictEqual(fastifyUnderPressure.fastifyUnderPressure.TYPE_EVENT_LOOP_DELAY, 'eventLoopDelay')
  assert.strictEqual(fastifyUnderPressure.fastifyUnderPressure.TYPE_EVENT_LOOP_UTILIZATION, 'eventLoopUtilization')
  assert.strictEqual(fastifyUnderPressure.fastifyUnderPressure.TYPE_HEALTH_CHECK, 'healthCheck')
  assert.strictEqual(fastifyUnderPressure.fastifyUnderPressure.TYPE_HEAP_USED_BYTES, 'heapUsedBytes')
  assert.strictEqual(fastifyUnderPressure.fastifyUnderPressure.TYPE_RSS_BYTES, 'rssBytes')
})
