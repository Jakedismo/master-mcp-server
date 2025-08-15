import type http from 'node:http'
import { createTestServer } from '../../_utils/test-server.js'

export interface FakeBackendOptions {
  id: string
  tools?: Array<{ name: string; description?: string }>
  resources?: Array<{ uri: string; description?: string; mimeType?: string }>
}

export async function startFakeMcpBackend(opts: FakeBackendOptions): Promise<{ url: string; stop: () => Promise<void> }> {
  const srv = await createTestServer()
  const tools = opts.tools ?? [{ name: 'echo', description: 'Echo input' }]
  const resources = opts.resources ?? []

  srv.register('GET', '/health', () => ({ body: { ok: true } }))
  srv.register('GET', '/capabilities', () => ({ body: { tools, resources } }))
  srv.register('POST', '/mcp/tools/list', () => ({ body: { tools } }))
  srv.register('POST', '/mcp/resources/list', () => ({ body: { resources } }))
  srv.register('POST', '/mcp/tools/call', (_req: http.IncomingMessage, raw) => {
    const body = safeParse(raw)
    if (body?.name === 'echo') return { body: { content: body?.arguments ?? {}, isError: false } }
    return { body: { content: { error: 'unknown tool' }, isError: true } }
  })
  srv.register('POST', '/mcp/resources/read', (_req, raw) => {
    const body = safeParse(raw)
    return { body: { contents: `content:${body?.uri ?? ''}`, mimeType: 'text/plain' } }
  })

  return { url: srv.url, stop: srv.close }
}

function safeParse(raw?: string): any {
  try { return raw ? JSON.parse(raw) : undefined } catch { return undefined }
}

