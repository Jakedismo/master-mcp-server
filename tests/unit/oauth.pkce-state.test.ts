import '../setup/test-setup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { PKCEManager } from '../../src/oauth/pkce-manager.js'
import { StateManager } from '../../src/oauth/state-manager.js'
import { FlowValidator } from '../../src/oauth/flow-validator.js'

test('PKCEManager generates and verifies', async () => {
  const pkce = new PKCEManager({ ttlMs: 1000 })
  const state = 'abc'
  const { challenge, method, verifier } = await pkce.generate(state)
  assert.ok(challenge.length > 16)
  assert.equal(method, 'S256')
  const v = pkce.getVerifier(state)
  assert.equal(v, verifier)
  // consumed; second time should be undefined
  assert.equal(pkce.getVerifier(state), undefined)
})

test('StateManager create/consume with TTL', async () => {
  const sm = new StateManager({ ttlMs: 10 })
  const s = sm.create({ provider: 'p', issuedAt: 0 } as any)
  const peek = sm.peek(s)
  assert.ok(peek && peek.provider === 'p')
  const used = sm.consume(s)
  assert.ok(used)
  assert.equal(sm.consume(s), null)
})

test('FlowValidator validateReturnTo prevents open redirects', () => {
  const fv = new FlowValidator(() => ({
    master_oauth: {
      authorization_endpoint: 'https://a', token_endpoint: 'https://t', client_id: 'x', redirect_uri: 'http://l', scopes: ['openid']
    }, hosting: { platform: 'node' }, servers: []
  } as any))
  assert.equal(fv.validateReturnTo('http://evil.com', 'http://localhost:3000'), undefined)
  assert.equal(fv.validateReturnTo('http://localhost:3000/path', 'http://localhost:3000'), '/path')
  assert.equal(fv.validateReturnTo('/ok', 'http://x'), '/ok')
})

