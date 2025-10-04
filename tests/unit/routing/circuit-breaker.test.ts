import { test } from 'node:test'
import assert from 'node:assert'
import { CircuitBreaker, InMemoryCircuitStorage } from '../../../src/routing/circuit-breaker.js'

test('CircuitBreaker onSuccess in closed state should only reset failures', async () => {
  const storage = new InMemoryCircuitStorage()
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
    successThreshold: 2,
    recoveryTimeoutMs: 100,
  }, storage)
  const key = 'test-key'

  // Simulate some failures, but not enough to open the circuit
  breaker.onFailure(key)
  let record = storage.get(key)
  assert.strictEqual(record?.failures, 1, 'should have 1 failure')
  assert.strictEqual(record?.state, 'closed', 'should be in closed state')

  // Simulate a success
  breaker.onSuccess(key)
  record = storage.get(key)
  assert.strictEqual(record?.failures, 0, 'failures should be reset to 0')
  assert.strictEqual(record?.successes, 0, 'successes should remain 0') // This is the key check for the bug
  assert.strictEqual(record?.state, 'closed', 'should remain in closed state')
})

test('CircuitBreaker should open after reaching failure threshold', async () => {
    const storage = new InMemoryCircuitStorage()
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      successThreshold: 2,
      recoveryTimeoutMs: 100,
    }, storage)
    const key = 'test-key'

    breaker.onFailure(key)
    breaker.onFailure(key)

    const record = storage.get(key)
    assert.strictEqual(record?.state, 'open', 'should be in open state')
    assert.strictEqual(record?.failures, 2, 'should have 2 failures')
})

test('CircuitBreaker should transition to half-open after recovery timeout', async () => {
    const storage = new InMemoryCircuitStorage()
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      successThreshold: 2,
      recoveryTimeoutMs: 50,
    }, storage)
    const key = 'test-key'

    // Open the circuit
    breaker.onFailure(key)
    breaker.onFailure(key)

    // Wait for recovery timeout
    await new Promise(resolve => setTimeout(resolve, 60))

    // First call should be allowed and move to half-open
    const gate = breaker.canExecute(key)
    assert.strictEqual(gate.allowed, true, 'execution should be allowed')

    const record = storage.get(key)
    assert.strictEqual(record?.state, 'half_open', 'should be in half-open state')
})

test('CircuitBreaker should close after successes in half-open state', async () => {
    const storage = new InMemoryCircuitStorage()
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      successThreshold: 2,
      recoveryTimeoutMs: 50,
    }, storage)
    const key = 'test-key'

    // Open the circuit
    breaker.onFailure(key)
    breaker.onFailure(key)

    // Wait for recovery timeout
    await new Promise(resolve => setTimeout(resolve, 60))

    // Transition to half-open
    breaker.canExecute(key)

    // Succeed twice
    breaker.onSuccess(key)
    breaker.onSuccess(key)

    const record = storage.get(key)
    assert.strictEqual(record?.state, 'closed', 'should be in closed state')
    assert.strictEqual(record?.failures, 0, 'failures should be reset')
    assert.strictEqual(record?.successes, 0, 'successes should be reset')
})

test('CircuitBreaker should re-open after failure in half-open state', async () => {
    const storage = new InMemoryCircuitStorage()
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      successThreshold: 2,
      recoveryTimeoutMs: 50,
    }, storage)
    const key = 'test-key'

    // Open the circuit
    breaker.onFailure(key)
    breaker.onFailure(key)

    // Wait for recovery timeout
    await new Promise(resolve => setTimeout(resolve, 60))

    // Transition to half-open
    breaker.canExecute(key)

    // Fail once
    breaker.onFailure(key)

    const record = storage.get(key)
    assert.strictEqual(record?.state, 'open', 'should be in open state again')
})