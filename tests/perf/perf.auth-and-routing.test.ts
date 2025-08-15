import '../setup/test-setup.js'
import test from 'node:test'
import { performance } from 'node:perf_hooks'
import { MultiAuthManager } from '../../src/auth/multi-auth-manager.js'
import { AuthStrategy } from '../../src/types/config.js'
import { createMockServer } from '../utils/mock-http.js'
import { RequestRouter } from '../../src/modules/request-router.js'
import { CapabilityAggregator } from '../../src/modules/capability-aggregator.js'

test('Perf: validateClientToken and routeCallTool throughput (smoke)', async (t) => {
  const mam = new MultiAuthManager({ authorization_endpoint: 'http://a', token_endpoint: 'http://t', client_id: 'x', redirect_uri: 'http://l', scopes: ['openid'] } as any)
  mam.registerServerAuth('s', AuthStrategy.BYPASS_AUTH)
  const N = 1000
  const t0 = performance.now()
  for (let i = 0; i < N; i++) await mam.validateClientToken('opaque-token')
  const dt = performance.now() - t0
  t.diagnostic(`validateClientToken x${N}: ${Math.round(dt)}ms (${Math.round((N/dt)*1000)} ops/sec)`) // eslint-disable-line

  const upstream = await createMockServer([
    { method: 'POST', path: '/mcp/tools/call', handler: () => ({ body: { content: { ok: true } } }) },
  ])
  const servers = new Map<string, any>([[ 's', { id: 's', type: 'node', endpoint: upstream.url, config: {} as any, status: 'running', lastHealthCheck: 0 } ]])
  const rr = new RequestRouter(servers as any, new CapabilityAggregator())
  const M = 200
  const t1 = performance.now()
  for (let i = 0; i < M; i++) await rr.routeCallTool({ name: 's.ping' })
  const dt2 = performance.now() - t1
  t.diagnostic(`routeCallTool x${M}: ${Math.round(dt2)}ms (${Math.round((M/dt2)*1000)} rps)`) // eslint-disable-line
  await upstream.close()
})

