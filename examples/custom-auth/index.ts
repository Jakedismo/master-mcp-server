import express from 'express'
import type { Request, Response } from 'express'
import { ConfigLoader } from '../../src/config/config-loader.js'
import { MasterServer } from '../../src/server/master-server.js'
import { MultiAuthManager } from '../../src/auth/multi-auth-manager.js'
import { CapabilityAggregator } from '../../src/modules/capability-aggregator.js'
import { collectSystemMetrics } from '../../src/utils/monitoring.js'

// A custom auth manager that adds an extra header for a specific backend
class CustomAuthManager extends MultiAuthManager {
  override async handleMasterOAuth(serverId: string, clientToken: string) {
    const base = await super.handleMasterOAuth(serverId, clientToken)
    // Example: add a hint header for a particular backend
    if (serverId === 'custom-proxy') {
      return { ...base, 'X-Custom-Auth': 'enabled' }
    }
    return base
  }
}

async function main() {
  const configPath = process.env.MASTER_CONFIG_PATH || 'examples/custom-auth/config.yaml'
  const cfg = await ConfigLoader.load({ path: configPath })

  const master = new MasterServer()
  const customAuth = new CustomAuthManager(cfg.master_oauth)
  // Register per-server strategies from config
  for (const s of cfg.servers) customAuth.registerServerAuth(s.id, s.auth_strategy as any, s.auth_config as any)
  master.attachAuthManager(customAuth)

  await master.startFromConfig(cfg)

  const app = express()
  app.use(express.json())

  app.get('/health', (_req, res) => res.json({ ok: true }))
  app.get('/metrics', (_req, res) => res.json({ ok: true, system: collectSystemMetrics() }))

  // OAuth endpoints
  master.getOAuthFlowController().registerExpress(app)

  // Capabilities
  app.get('/capabilities', (_req: Request, res: Response) => {
    const agg = new CapabilityAggregator()
    const caps = agg.aggregate(Array.from(master.getRouter().getServers().values()))
    res.json(caps)
  })

  const getToken = (req: Request) => {
    const h = req.headers['authorization'] || req.headers['Authorization']
    return typeof h === 'string' && h.toLowerCase().startsWith('bearer ') ? h.slice(7) : undefined
  }

  // MCP endpoints
  app.post('/mcp/tools/list', async (_req: Request, res: Response) => {
    const handler = master.handler
    const result = await handler.handleListTools({ type: 'list_tools' } as any)
    res.json(result)
  })

  app.post('/mcp/tools/call', async (req: Request, res: Response) => {
    const token = getToken(req)
    const handler = new (master.handler.constructor as any)({
      aggregator: (master as any).aggregator,
      router: master.getRouter(),
      getClientToken: () => token,
    }) as typeof master.handler
    const result = await handler.handleCallTool({ name: req.body?.name, arguments: req.body?.arguments ?? {} } as any)
    res.json(result)
  })

  app.post('/mcp/resources/list', async (_req: Request, res: Response) => {
    const handler = master.handler
    const result = await handler.handleListResources({ type: 'list_resources' } as any)
    res.json(result)
  })

  app.post('/mcp/resources/read', async (req: Request, res: Response) => {
    const token = getToken(req)
    const handler = new (master.handler.constructor as any)({
      aggregator: (master as any).aggregator,
      router: master.getRouter(),
      getClientToken: () => token,
    }) as typeof master.handler
    const result = await handler.handleReadResource({ uri: req.body?.uri } as any)
    res.json(result)
  })

  const port = cfg.hosting.port || 3000
  app.listen(port, () => console.log(`Custom auth example on :${port}`))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

