'use strict'

const { test } = require('tap')
const fastifyUnderPressure = require('..')
const { TYPE_EVENT_LOOP_DELAY, TYPE_EVENT_LOOP_UTILIZATION, TYPE_HEALTH_CHECK, TYPE_HEAP_USED_BYTES, TYPE_RSS_BYTES } = require('..')

test('module.exports', t => {
  t.plan(20)

  t.equal(typeof fastifyUnderPressure.default, 'function')
  t.equal(typeof fastifyUnderPressure.fastifyUnderPressure, 'function')
  t.equal(fastifyUnderPressure.fastifyUnderPressure.name, 'fastifyUnderPressure')
  t.equal(fastifyUnderPressure.fastifyUnderPressure, fastifyUnderPressure.fastifyUnderPressure.fastifyUnderPressure)
  t.equal(fastifyUnderPressure.fastifyUnderPressure.default, fastifyUnderPressure.fastifyUnderPressure.fastifyUnderPressure)

  t.equal(TYPE_EVENT_LOOP_DELAY, 'eventLoopDelay')
  t.equal(TYPE_EVENT_LOOP_UTILIZATION, 'eventLoopUtilization')
  t.equal(TYPE_HEALTH_CHECK, 'healthCheck')
  t.equal(TYPE_HEAP_USED_BYTES, 'heapUsedBytes')
  t.equal(TYPE_RSS_BYTES, 'rssBytes')

  t.equal(fastifyUnderPressure.TYPE_RSS_BYTES, 'rssBytes')
  t.equal(fastifyUnderPressure.TYPE_EVENT_LOOP_DELAY, 'eventLoopDelay')
  t.equal(fastifyUnderPressure.TYPE_EVENT_LOOP_UTILIZATION, 'eventLoopUtilization')
  t.equal(fastifyUnderPressure.TYPE_HEALTH_CHECK, 'healthCheck')
  t.equal(fastifyUnderPressure.TYPE_HEAP_USED_BYTES, 'heapUsedBytes')

  t.equal(fastifyUnderPressure.fastifyUnderPressure.TYPE_EVENT_LOOP_DELAY, 'eventLoopDelay')
  t.equal(fastifyUnderPressure.fastifyUnderPressure.TYPE_EVENT_LOOP_UTILIZATION, 'eventLoopUtilization')
  t.equal(fastifyUnderPressure.fastifyUnderPressure.TYPE_HEALTH_CHECK, 'healthCheck')
  t.equal(fastifyUnderPressure.fastifyUnderPressure.TYPE_HEAP_USED_BYTES, 'heapUsedBytes')
  t.equal(fastifyUnderPressure.fastifyUnderPressure.TYPE_RSS_BYTES, 'rssBytes')
})
