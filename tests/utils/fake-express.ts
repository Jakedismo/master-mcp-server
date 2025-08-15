type Handler = (req: any, res: any) => void | Promise<void>

export class FakeExpressApp {
  routes: Record<string, { method: 'GET'|'POST'; handler: Handler }> = {}
  use(_arg: any): void { /* ignore middleware */ }
  get(path: string, handler: Handler): void { this.routes[`GET ${path}`] = { method: 'GET', handler } }
  post(path: string, handler: Handler): void { this.routes[`POST ${path}`] = { method: 'POST', handler } }
  async invoke(method: 'GET'|'POST', path: string, options?: { query?: Record<string,string>, headers?: Record<string,string>, body?: any }) {
    const key = `${method} ${path}`
    const route = this.routes[key]
    if (!route) throw new Error(`Route not found: ${key}`)
    const req = {
      method,
      query: options?.query ?? {},
      headers: options?.headers ?? {},
      body: options?.body ?? undefined,
      protocol: 'http',
      get: (h: string) => (options?.headers?.[h.toLowerCase()] ?? options?.headers?.[h] ?? undefined),
    }
    let statusCode = 200
    let sentHeaders: Record<string,string> = {}
    let payload: any
    const res = {
      set: (k: string, v: string) => { sentHeaders[k.toLowerCase()] = v },
      status: (c: number) => { statusCode = c; return res },
      send: (b: any) => { payload = b },
      json: (b: any) => { sentHeaders['content-type'] = 'application/json'; payload = JSON.stringify(b) },
      redirect: (loc: string) => { statusCode = 302; sentHeaders['location'] = loc; payload = '' },
    }
    await route.handler(req, res)
    return { status: statusCode, headers: sentHeaders, body: payload }
  }
}

