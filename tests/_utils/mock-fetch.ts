// Lightweight Node fetch mocking via Undici MockAgent (Node 18)
// Falls back to no-op if Undici not available.

type RemoveFn = () => void

export function withMockFetch(routes: Array<{ method: string; url: RegExp | string; reply: (body?: any) => any }>): RemoveFn {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const undici = require('undici')
    const agent = new undici.MockAgent()
    agent.disableNetConnect()
    const pool = agent.get('http://localhost')
    for (const r of routes) {
      const method = r.method.toUpperCase()
      const matcher = typeof r.url === 'string' ? new RegExp(r.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : r.url
      pool.intercept({ path: matcher, method }).reply(200, (_opts: any) => r.reply(_opts?.body))
    }
    undici.setGlobalDispatcher(agent)
    return () => undici.setGlobalDispatcher(new undici.Agent())
  } catch {
    // No undici; do nothing.
    return () => void 0
  }
}

