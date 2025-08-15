import '../setup/test-setup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { CircuitBreaker, CircuitOpenError } from '../../src/routing/circuit-breaker.js'
import { RetryHandler } from '../../src/routing/retry-handler.js'
import { LoadBalancer } from '../../src/routing/load-balancer.js'

test('CircuitBreaker opens and recovers', async () => {
  const cb = new CircuitBreaker({ failureThreshold: 2, successThreshold: 1, recoveryTimeoutMs: 10 })
  const key = 'svc::inst'
  await assert.rejects(cb.execute(key, async () => { throw new Error('fail') }))
  await assert.rejects(cb.execute(key, async () => { throw new Error('fail') }))
  // Now circuit open
  await assert.rejects(cb.execute(key, async () => 'ok'), (e: any) => e instanceof CircuitOpenError)
  // Wait for half-open
  await new Promise((r) => setTimeout(r, 12))
  const res = await cb.execute(key, async () => 'ok')
  assert.equal(res, 'ok')
})

test('RetryHandler retries on 5xx and succeeds', async () => {
  const rh = new RetryHandler({ maxRetries: 2, baseDelayMs: 1, maxDelayMs: 2, jitter: 'none' })
  let n = 0
  const res = await rh.execute(async () => {
    n++
    if (n < 3) { const err: any = new Error('HTTP 500'); err.status = 500; throw err }
    return 'ok'
  })
  assert.equal(res, 'ok')
  assert.equal(n, 3)
})

test('LoadBalancer round-robin selection', () => {
  const lb = new LoadBalancer({ strategy: 'round_robin' })
  const pool = [ { id: 'a' }, { id: 'b' }, { id: 'c' } ] as any
  const chosen = [
    lb.select('svc', pool)!.id,
    lb.select('svc', pool)!.id,
    lb.select('svc', pool)!.id,
    lb.select('svc', pool)!.id,
  ]
  assert.deepEqual(chosen, ['a','b','c','a'])
})

