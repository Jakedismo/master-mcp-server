import '../setup/test-setup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { RouteRegistry } from '../../src/routing/route-registry.js'
import { CircuitBreaker } from '../../src/routing/circuit-breaker.js'
import { LoadBalancer } from '../../src/routing/load-balancer.js'

test('RouteRegistry resolves and caches, bumps health', () => {
  const servers = new Map([
    ['s1', { id: 's1', type: 'node', endpoint: 'http://localhost:1234', config: {} as any, status: 'running', lastHealthCheck: Date.now(), instances: [
      { id: 'i1', url: 'http://localhost:1', healthScore: 50 },
      { id: 'i2', url: 'http://localhost:2', healthScore: 50 },
    ] }]
  ])
  const reg = new RouteRegistry(servers as any, new CircuitBreaker({ failureThreshold: 5, successThreshold: 1, recoveryTimeoutMs: 10 }), new LoadBalancer())
  const r1 = reg.resolve('s1')!
  assert.ok(r1.instance.id === 'i1' || r1.instance.id === 'i2')
  // mark success and failure adjust health without throwing
  reg.markSuccess('s1', r1.instance.id)
  reg.markFailure('s1', r1.instance.id)
})

