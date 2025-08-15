import '../setup/test-setup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { CapabilityAggregator } from '../../src/modules/capability-aggregator.js'
import { createMockServer } from '../utils/mock-http.js'

test('CapabilityAggregator discovers via /capabilities', async () => {
  const caps = {
    tools: [{ name: 't1' }],
    resources: [{ uri: 'r1' }],
  }
  const srv = await createMockServer([
    { method: 'GET', path: '/capabilities', handler: () => ({ body: caps }) },
  ])
  try {
    const servers = new Map<string, any>([[
      's1', { id: 's1', type: 'node', endpoint: srv.url, config: {} as any, status: 'running', lastHealthCheck: 0 }
    ]])
    const ag = new CapabilityAggregator()
    await ag.discoverCapabilities(servers as any)
    const tools = ag.getAllTools(servers as any)
    assert.equal(tools[0].name, 's1.t1')
    const map = ag.getMappingForTool('s1.t1')
    assert.equal(map?.originalName, 't1')
  } finally {
    await srv.close()
  }
})

