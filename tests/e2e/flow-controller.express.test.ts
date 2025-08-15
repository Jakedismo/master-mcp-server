import '../setup/test-setup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { OAuthFlowController } from '../../src/oauth/flow-controller.js'
import { FakeExpressApp } from '../utils/fake-express.js'
import { createMockServer } from '../utils/mock-http.js'

test('OAuthFlowController Express flow: authorize -> token -> callback', async () => {
  const tokenSrv = await createMockServer([
    { method: 'POST', path: '/token', handler: (_req, _body) => ({ body: { access_token: 'AT', expires_in: 60, scope: 'openid' } }) },
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
      hosting: { platform: 'node', base_url: 'http://localhost' },
      servers: [],
    }
    const ctrl = new OAuthFlowController({ getConfig: () => cfg as any })
    const app = new FakeExpressApp()
    ctrl.registerExpress(app as any)

    const auth = await app.invoke('GET', '/oauth/authorize', { query: { provider: 'master' } })
    assert.equal(auth.status, 200)
    assert.match(String(auth.body), /Redirecting/)
    const m = String(auth.body).match(/url=([^"\s]+)/)
    assert.ok(m && m[1])
    const urlStr = m[1].replace(/&amp;/g, '&') // Decode HTML entities
    const url = new URL(urlStr)
    const state = url.searchParams.get('state')!
    assert.ok(state)

    const cb = await app.invoke('GET', '/oauth/callback', { query: { state, code: 'good', provider: 'master' } })
    assert.equal(cb.status, 200)
    assert.match(String(cb.body), /Authorization complete|You may close this window/)
  } finally {
    await tokenSrv.close()
  }
})

