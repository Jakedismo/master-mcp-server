import '../setup/test-setup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { OAuthFlowController } from '../../src/oauth/flow-controller.js'
import { createMockServer } from '../utils/mock-http.js'

test('OAuthFlowController Worker-style authorize and callback', async () => {
  const tokenSrv = await createMockServer([
    { method: 'POST', path: '/token', handler: () => ({ body: { access_token: 'AT', expires_in: 60, scope: 'openid' } }) },
  ])
  try {
    const cfg = {
      master_oauth: {
        authorization_endpoint: tokenSrv.url + '/authorize',
        token_endpoint: tokenSrv.url + '/token',
        client_id: 'cid',
        redirect_uri: 'http://localhost/oauth/callback',
        scopes: ['openid'],
      },
      hosting: { platform: 'cloudflare-workers', base_url: 'http://localhost' },
      servers: [],
    }
    const ctrl = new OAuthFlowController({ getConfig: () => cfg as any })
    const base = 'http://localhost'
    const authRes = await ctrl.handleRequest(new Request(base + '/oauth/authorize?provider=master', { method: 'GET' }))
    assert.equal(authRes.status, 200)
    const html = await authRes.text()
    const m = html.match(/url=([^"\s]+)/)
    assert.ok(m && m[1])
    const urlStr = m[1].replace(/&amp;/g, '&') // Decode HTML entities
    const state = new URL(urlStr).searchParams.get('state')!
    const cbRes = await ctrl.handleRequest(new Request(base + `/oauth/callback?state=${encodeURIComponent(state)}&code=good&provider=master`, { method: 'GET' }))
    assert.equal(cbRes.status, 200)
  } finally {
    await tokenSrv.close()
  }
})

