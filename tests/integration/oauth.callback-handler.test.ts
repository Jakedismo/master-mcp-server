import '../setup/test-setup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { CallbackHandler } from '../../src/oauth/callback-handler.js'
import { PKCEManager } from '../../src/oauth/pkce-manager.js'
import { StateManager } from '../../src/oauth/state-manager.js'
import { createMockServer } from '../utils/mock-http.js'

test('CallbackHandler exchanges code and stores token', async () => {
  const tokenSrv = await createMockServer([
    { method: 'POST', path: '/token', handler: (_req, body) => {
      if (body.code === 'good') return { body: { access_token: 'AT', expires_in: 60, scope: 'openid' } }
      return { status: 400, body: { error: 'bad code' } }
    } },
  ])
  try {
    const pkce = new PKCEManager()
    const stateMgr = new StateManager()
    const state = stateMgr.create({ provider: 'prov', serverId: 'srv', clientToken: 'CT', returnTo: '/done' })
    const { verifier } = await pkce.generate(state)
    // pkce manager consumes verifier on getVerifier(), which CallbackHandler will do
    const cfg: any = {
      master_oauth: { authorization_endpoint: tokenSrv.url + '/auth', token_endpoint: tokenSrv.url + '/token', client_id: 'cid', redirect_uri: tokenSrv.url + '/cb', scopes: ['openid'] },
      hosting: { platform: 'node' },
      servers: [],
    }
    let stored: any
    const cb = new CallbackHandler({ config: cfg, stateManager: stateMgr, pkceManager: pkce, baseUrl: tokenSrv.url, storeDelegatedToken: async (ct, sid, tok) => { stored = { ct, sid, tok } } })
    const res = await cb.handleCallback(new URLSearchParams({ state, code: 'good' }), { provider: 'custom', authorization_endpoint: tokenSrv.url + '/auth', token_endpoint: tokenSrv.url + '/token', client_id: 'cid' })
    assert.ok(res.token)
    assert.equal(stored.ct, 'CT')
    assert.equal(stored.sid, 'srv')
    assert.equal(stored.tok.access_token, 'AT')
  } finally {
    await tokenSrv.close()
  }
})

