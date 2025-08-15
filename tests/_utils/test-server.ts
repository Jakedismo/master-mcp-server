import http from 'node:http'

export interface RouteHandler {
  (req: http.IncomingMessage, body: string | undefined): { status?: number; headers?: Record<string, string>; body?: any }
}

export interface TestServer {
  url: string
  port: number
  close: () => Promise<void>
  register: (method: string, path: string, handler: RouteHandler) => void
}

export function createTestServer(): Promise<TestServer> {
  const routes = new Map<string, RouteHandler>()
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      const key = `${(req.method || 'GET').toUpperCase()} ${url.pathname}`
      let body: string | undefined
      if (req.method && ['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
        body = await new Promise<string>((resolve) => {
          const chunks: Buffer[] = []
          req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))))
          req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        })
      }
      const handler = routes.get(key)
      if (!handler) {
        res.statusCode = 404
        res.end('not found')
        return
      }
      const result = handler(req, body)
      const status = result.status ?? 200
      const headers = { 'content-type': 'application/json', ...(result.headers ?? {}) }
      const payload = typeof result.body === 'string' ? result.body : JSON.stringify(result.body ?? { ok: true })
      res.writeHead(status, headers)
      res.end(payload)
    } catch (err: any) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: err?.message ?? 'internal error' }))
    }
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({
        port,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
        register: (method: string, path: string, handler: RouteHandler) => {
          routes.set(`${method.toUpperCase()} ${path}`, handler)
        },
      })
    })
  })
}

