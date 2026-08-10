'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const Fastify = require('fastify')
const proxyquire = require('proxyquire')
const sinon = require('sinon')

function createEventLoopUtilization (samples) {
  let sampleIndex = 0

  return function eventLoopUtilization (utilization1, utilization2) {
    if (utilization1 === undefined) {
      return samples[sampleIndex++]
    }

    const current = utilization2 === undefined ? samples[sampleIndex++] : utilization1
    const baseline = utilization2 === undefined ? utilization1 : utilization2
    const active = current.active - baseline.active
    const idle = current.idle - baseline.idle

    return {
      active,
      idle,
      utilization: active / (active + idle)
    }
  }
}

async function sampleUtilization (eventLoopUtilizationMode) {
  const clock = sinon.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout']
  })
  const fastify = Fastify()
  const eventLoopUtilization = createEventLoopUtilization([
    { active: 0, idle: 0, utilization: 0 },
    { active: 0, idle: 100, utilization: 0 },
    { active: 100, idle: 100, utilization: 0.5 }
  ])
  const underPressure = proxyquire('../index', {
    'node:perf_hooks': {
      monitorEventLoopDelay: () => ({
        enable: () => {},
        reset: () => {},
        mean: 0
      }),
      performance: { eventLoopUtilization }
    }
  })
  const options = {
    maxEventLoopUtilization: 0.75,
    sampleInterval: 10
  }

  if (eventLoopUtilizationMode) {
    options.eventLoopUtilizationMode = eventLoopUtilizationMode
  }

  try {
    fastify.register(underPressure, options)
    fastify.get('/', () => 'ok')
    await fastify.ready()

    await clock.tickAsync(10)
    assert.strictEqual(fastify.memoryUsage().eventLoopUtilized, 0)

    await clock.tickAsync(10)
    const response = await fastify.inject().get('/').end()

    return {
      eventLoopUtilized: fastify.memoryUsage().eventLoopUtilized,
      isUnderPressure: fastify.isUnderPressure(),
      statusCode: response.statusCode
    }
  } finally {
    await fastify.close()
    clock.restore()
  }
}

test('eventLoopUtilizationMode measures cumulative or interval utilization', async () => {
  assert.deepStrictEqual(await sampleUtilization(), {
    eventLoopUtilized: 0.5,
    isUnderPressure: false,
    statusCode: 200
  })
  assert.deepStrictEqual(await sampleUtilization('interval'), {
    eventLoopUtilized: 1,
    isUnderPressure: true,
    statusCode: 503
  })
})
