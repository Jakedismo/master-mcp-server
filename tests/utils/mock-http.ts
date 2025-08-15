import http from 'node:http'

export type Handler = (req: http.IncomingMessage, body: any) => { status?: number; headers?: Record<string, string>; body?: any }

export interface Route {
  method: string
  path: string | RegExp
  handler: Handler
}

export interface MockServer {
  url: string
  port: number
  close: () => Promise<void>
}

export function createMockServer(routes: Route[], opts?: { port?: number }): Promise<MockServer> {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    let body: any = Buffer.concat(chunks).toString('utf8')
    const ct = (req.headers['content-type'] || '').toString()
    try {
      if (ct.includes('application/json') && body) body = JSON.parse(body)
      else if (ct.includes('application/x-www-form-urlencoded') && body) body = Object.fromEntries(new URLSearchParams(body))
    } catch {
      // leave as raw string
    }

    const route = routes.find((r) => r.method.toUpperCase() === (req.method || '').toUpperCase() &&
      (typeof r.path === 'string' ? r.path === url.pathname : r.path.test(url.pathname)))

    const result = route ? route.handler(req, body) : { status: 404, body: { error: 'not found' } }
    const status = result.status ?? 200
    const headers = result.headers ?? { 'content-type': 'application/json' }
    const payload = result.body ?? { ok: true }
    res.statusCode = status
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
    res.end(typeof payload === 'string' || Buffer.isBuffer(payload) ? payload : JSON.stringify(payload))
  })

  return new Promise((resolve) => {
    server.listen(opts?.port ?? 0, () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : (opts?.port ?? 0)
      resolve({
        url: `http://localhost:${port}`,
        port,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

