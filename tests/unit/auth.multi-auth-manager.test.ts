import '../setup/test-setup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { MultiAuthManager } from '../../src/auth/multi-auth-manager.js'
import { AuthStrategy } from '../../src/types/config.js'

const masterCfg = {
  authorization_endpoint: 'http://localhost/auth',
  token_endpoint: 'http://localhost/token',
  client_id: 'master',
  redirect_uri: 'http://localhost/cb',
  scopes: ['openid'],
}

test('MultiAuthManager pass-through and delegation', async () => {
  const mam = new MultiAuthManager(masterCfg as any)
  mam.registerServerAuth('srv1', AuthStrategy.MASTER_OAUTH)
  const h = await mam.prepareAuthForBackend('srv1', 'CLIENT')
  assert.equal(h.Authorization, 'Bearer CLIENT')

  mam.registerServerAuth('srv2', AuthStrategy.DELEGATE_OAUTH, {
    provider: 'custom', authorization_endpoint: 'http://p/auth', token_endpoint: 'http://p/token', client_id: 'c'
  })
  const d = await mam.prepareAuthForBackend('srv2', 'CLIENT') as any
  assert.equal(d.type, 'oauth_delegation')
})

test('MultiAuthManager stores delegated server token', async () => {
  const mam = new MultiAuthManager(masterCfg as any)
  await mam.storeDelegatedToken('CLIENT', 'srv', { access_token: 'S', expires_at: Date.now() + 1000, scope: [] })
  const tok = await mam.getStoredServerToken('srv', 'CLIENT')
  assert.equal(tok, 'S')
})

