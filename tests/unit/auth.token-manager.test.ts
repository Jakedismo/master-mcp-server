import '../setup/test-setup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { TokenManager, InMemoryTokenStorage } from '../../src/auth/token-manager.js'

test('TokenManager stores, retrieves and cleans up', async () => {
  const storage = new InMemoryTokenStorage()
  const tm = new TokenManager({ storage, secret: 'k' })
  const key = 'user::server'
  await tm.storeToken(key, { access_token: 't', expires_at: Date.now() + 50, scope: [] })
  const tok = await tm.getToken(key)
  assert.equal(tok?.access_token, 't')
  await new Promise((r) => setTimeout(r, 60))
  await tm.cleanupExpiredTokens()
  const tok2 = await tm.getToken(key)
  assert.equal(tok2, null)
})

test('TokenManager works with custom KV-like storage', async () => {
  const { MemoryKVStorage } = await import('../utils/token-storages.js')
  const storage = new MemoryKVStorage()
  const tm = new TokenManager({ storage, secret: 'k' })
  await tm.storeToken('k1', { access_token: 'Z', expires_at: Date.now() + 1000, scope: [] })
  const tok = await tm.getToken('k1')
  assert.equal(tok?.access_token, 'Z')
})
