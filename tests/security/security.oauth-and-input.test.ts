import '../setup/test-setup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { CallbackHandler } from '../../src/oauth/callback-handler.js'
import { PKCEManager } from '../../src/oauth/pkce-manager.js'
import { StateManager } from '../../src/oauth/state-manager.js'
import { TokenManager, InMemoryTokenStorage } from '../../src/auth/token-manager.js'

test('CallbackHandler rejects missing/invalid state', async () => {
  const cb = new CallbackHandler({
    config: { master_oauth: { authorization_endpoint: 'http://a', token_endpoint: 'http://t', client_id: 'x', redirect_uri: 'http://l', scopes: ['openid'] }, hosting: { platform: 'node' }, servers: [] } as any,
    stateManager: new StateManager(),
    pkceManager: new PKCEManager(),
    baseUrl: 'http://localhost',
  })
  const res = await cb.handleCallback(new URLSearchParams({ state: 'nope', code: 'x' }), { provider: 'custom', authorization_endpoint: 'http://a', token_endpoint: 'http://t', client_id: 'x' })
  assert.ok(res.error)
})

test('TokenManager decryption failure is handled and entry removed', async () => {
  const storage = new InMemoryTokenStorage()
  const tm1 = new TokenManager({ storage, secret: 'a' })
  const tm2 = new TokenManager({ storage, secret: 'b' })
  const key = 'k'
  await tm1.storeToken(key, { access_token: 'X', expires_at: Date.now() + 1000, scope: [] })
  const before = await tm2.getToken(key)
  assert.equal(before, null) // decryption failed => deleted
})

