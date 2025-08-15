import '../setup/test-setup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { MetricRegistry, HealthCheckRegistry, monitorEventLoopLag } from '../../src/utils/monitoring.js'

test('MetricRegistry counters/gauges/histograms', () => {
  const R = new MetricRegistry()
  R.counter('c').inc()
  R.gauge('g').set(5)
  R.histogram('h').observe(0.02)
  const snap = R.list()
  assert.equal(snap.counters.c, 1)
  assert.equal(snap.gauges.g, 5)
  assert.ok(Array.isArray(snap.histograms.h.counts))
})

test('HealthCheckRegistry aggregates ok/degraded', async () => {
  const H = new HealthCheckRegistry()
  H.register('ok', async () => ({ ok: true }))
  H.register('bad', async () => ({ ok: false, info: 'x' }))
  const res = await H.run()
  assert.equal(res.status, 'degraded')
})

test('monitorEventLoopLag provides callback and stopper', async () => {
  let called = 0
  const stop = monitorEventLoopLag(() => { called++ }, 5)
  await new Promise((r) => setTimeout(r, 20))
  stop()
  assert.ok(called >= 1)
})

