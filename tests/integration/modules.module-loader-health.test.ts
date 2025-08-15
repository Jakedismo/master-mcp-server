import '../setup/test-setup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { DefaultModuleLoader } from '../../src/modules/module-loader.js'
import { createMockServer } from '../utils/mock-http.js'

test('DefaultModuleLoader performHealthCheck against /health JSON', async () => {
  const srv = await createMockServer([
    { method: 'GET', path: '/health', handler: () => ({ body: { ok: true } }) },
  ])
  try {
    const loader = new DefaultModuleLoader()
    const ls: any = { id: 'a', type: 'node', endpoint: srv.url, config: {} as any, status: 'starting', lastHealthCheck: 0 }
    const ok = await loader.performHealthCheck(ls)
    assert.equal(ok, true)
    // performHealthCheck doesn't update status, that's done by the load method
    assert(ls.lastHealthCheck > 0, 'lastHealthCheck should be updated')
  } finally {
    await srv.close()
  }
})

