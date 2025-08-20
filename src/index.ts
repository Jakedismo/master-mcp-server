import 'dotenv/config'
import express from 'express'
import type { Request, Response } from 'express'
import { DependencyContainer } from './server/dependency-container.js'
import { collectSystemMetrics } from './utils/monitoring.js'
import { CapabilityAggregator } from './modules/capability-aggregator.js'
import { createMcpServer } from './mcp-server.js'

export interface RunningServer {
  name: string
  version: string
  container: DependencyContainer
  stop: () => Promise<void>
}

function isNode(): boolean {
  return Boolean((globalThis as any)?.process?.versions?.node)
}

export async function createServer(startHttp = true): Promise<RunningServer> {
  const version = (globalThis as any)?.process?.env?.APP_VERSION ?? '0.1.0'
  const container = new DependencyContainer()
  await container.initialize()

  const server: RunningServer = {
    name: 'master-mcp-server',
    version,
    container,
    stop: async () => {
      try {
        container.configManager.stop()
        await container.master.unloadAll()
      } catch {
        // ignore
      }
    },
  }

  if (isNode() && startHttp) {
    await startNodeHttp(container)
  }

  // Graceful shutdown (Node only)
  if (isNode()) {
    const onSig = async () => {
      await server.stop()
      ;(process as any).exit?.(0)
    }
    process.on('SIGINT', onSig)
    process.on('SIGTERM', onSig)
  }

  return server
}

async function startNodeHttp(container: DependencyContainer): Promise<void> {
  const app = express()
  app.use(express.json())
  // Serve static assets for OAuth pages
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const expressStatic = (express as any).static
  if (expressStatic) app.use('/static', expressStatic('static'))

  const getToken = (req: Request): string | undefined => {
    const h = req.headers['authorization'] || req.headers['Authorization']
    if (typeof h === 'string' && h.toLowerCase().startsWith('bearer ')) return h.slice(7)
    return undefined
  }

  app.get('/health', (_req, res) => res.json({ ok: true }))
  app.get('/metrics', (_req, res) => {
    try {
      res.json({ ok: true, system: collectSystemMetrics() })
    } catch {
      res.json({ ok: true })
    }
  })
  // Mount OAuth endpoints using the master server's controller
  try {
    container.master.getOAuthFlowController().registerExpress(app)
  } catch {
    // If not available yet, ignore; will be mounted on demand if needed
  }
  app.get('/capabilities', (_req, res) => {
    const agg = new CapabilityAggregator()
    const caps = agg.aggregate(Array.from(container.master.getRouter().getServers().values()))
    res.json(caps)
  })

  // Create the MCP server with HTTP streaming transport
  const { handleRequest } = await createMcpServer(container)
  
  // Register MCP endpoints
  app.post('/mcp', handleRequest)
  app.get('/mcp', handleRequest)
  app.delete('/mcp', handleRequest)

  // Keep the existing endpoints for backward compatibility
  app.post('/mcp/tools/list', async (_req: Request, res: Response) => {
    const handler = container.master.handler
    const result = await handler.handleListTools({ type: 'list_tools' })
    res.json(result)
  })

  app.post('/mcp/tools/call', async (req: Request, res: Response) => {
    const token = getToken(req)
    const handler = new (container.master.handler.constructor as any)({
      aggregator: container.aggregator,
      router: container.master.getRouter(),
      getClientToken: () => token,
    }) as typeof container.master.handler
    const result = await handler.handleCallTool({ name: req.body?.name, arguments: req.body?.arguments ?? {} })
    res.json(result)
  })

  app.post('/mcp/resources/list', async (_req: Request, res: Response) => {
    const handler = container.master.handler
    const result = await handler.handleListResources({ type: 'list_resources' })
    res.json(result)
  })

  app.post('/mcp/resources/read', async (req: Request, res: Response) => {
    const token = getToken(req)
    const handler = new (container.master.handler.constructor as any)({
      aggregator: container.aggregator,
      router: container.master.getRouter(),
      getClientToken: () => token,
    }) as typeof container.master.handler
    const result = await handler.handleReadResource({ uri: req.body?.uri })
    res.json(result)
  })

  const port = container.getConfig().hosting.port ?? 3000
  await new Promise<void>((resolve) => {
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Master MCP listening on http://localhost:${port}`)
      resolve()
    })
  })
}

export default createServer

// If this file is being run directly (not imported), start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  createServer().catch((err) => {
    console.error('Failed to start server:', err)
    process.exit(1)
  })
}
