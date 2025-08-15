// Worker runtime with minimal surface to avoid Node-specific modules
import { ConfigLoader } from '../config/config-loader.js'
import { OAuthFlowController } from '../oauth/flow-controller.js'
import { collectSystemMetrics } from '../utils/monitoring.js'

export default {
  async fetch(_req: Request, env?: Record<string, unknown>): Promise<Response> {
    ;(globalThis as any).__WORKER_ENV = env || (globalThis as any).__WORKER_ENV || {}
    try {
      const url = new URL(_req.url)
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })
      }
      if (url.pathname === '/metrics') {
        return new Response(
          JSON.stringify({ ok: true, system: collectSystemMetrics() }),
          { headers: { 'content-type': 'application/json' } }
        )
      }
      if (url.pathname.startsWith('/oauth')) {
        const cfg = await ConfigLoader.loadFromEnv()
        const ctrl = new OAuthFlowController({ getConfig: () => cfg })
        return await ctrl.handleRequest(_req)
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      })
    } finally {
      // keep server warm for now; no-op
    }
  },
}
