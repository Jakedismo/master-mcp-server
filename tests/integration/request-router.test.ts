import '../setup/test-setup.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { RequestRouter } from '../../src/modules/request-router.js'
import { CapabilityAggregator } from '../../src/modules/capability-aggregator.js'
import { createMockServer } from '../utils/mock-http.js'

test('RequestRouter routes tool/resource with pass-through auth', async () => {
  const sOk = await createMockServer([
    { method: 'POST', path: '/mcp/tools/call', handler: (_req, body) => ({ body: { content: { ok: true, args: body.arguments } } }) },
    { method: 'POST', path: '/mcp/resources/read', handler: (_req, body) => ({ body: { contents: `read:${body.uri}`, mimeType: 'text/plain' } }) },
  ])
  try {
    const servers = new Map<string, any>([[
      's1', { id: 's1', type: 'node', endpoint: sOk.url, config: {} as any, status: 'running', lastHealthCheck: 0 }
    ]])
    const rr = new RequestRouter(servers as any, new CapabilityAggregator(), async (_sid, token) => token ? ({ Authorization: `Bearer ${token}` }) : undefined)
    const toolRes = await rr.routeCallTool({ name: 's1.echo', arguments: { a: 1 } }, 'CT')
    assert.equal((toolRes as any).content.ok, true)
    const readRes = await rr.routeReadResource({ uri: 's1.file' }, 'CT')
    assert.equal((readRes as any).contents, 'read:file')
  } finally {
    await sOk.close()
  }
})

test('RequestRouter returns delegation error when provider requires', async () => {
  const s = await createMockServer([
    { method: 'POST', path: '/mcp/tools/call', handler: (_req, _body) => ({ body: { content: { ok: true } } }) },
  ])
  try {
    const servers = new Map<string, any>([[ 's1', { id: 's1', type: 'node', endpoint: s.url, config: {} as any, status: 'running', lastHealthCheck: 0 } ]])
    const rr = new RequestRouter(servers as any, new CapabilityAggregator(), async () => ({ type: 'oauth_delegation', auth_endpoint: 'x', token_endpoint: 'y', client_info: {}, required_scopes: [], redirect_after_auth: true } as any))
    const res = await rr.routeCallTool({ name: 's1.x' }, 'CT')
    assert.equal((res as any).isError, true)
  } finally {
    await s.close()
  }
})

test('RequestRouter retries on transient failure and eventually succeeds', async () => {
  let n = 0
  const s = await createMockServer([
    { method: 'POST', path: '/mcp/tools/call', handler: () => {
      n++
      if (n < 3) return { status: 500, body: { error: 'boom' } }
      return { body: { content: { ok: true } } }
    } },
  ])
  try {
    const servers = new Map<string, any>([[ 's1', { id: 's1', type: 'node', endpoint: s.url, config: {} as any, status: 'running', lastHealthCheck: 0 } ]])
    const rr = new RequestRouter(servers as any, new CapabilityAggregator())
    const res = await rr.routeCallTool({ name: 's1.task' })
    // @ts-ignore
    assert.equal(res.content.ok, true)
  } finally {
    await s.close()
  }
})
