/**
 * HTTP utilities for request/response handling, header manipulation, and content
 * type parsing. Minimal and cross-platform (Node 18+ and Workers).
 */

export type HeadersLike = Headers | Record<string, string> | Array<[string, string]>

export function normalizeHeaders(h: HeadersLike | undefined | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!h) return out
  if (typeof (h as any).forEach === 'function') {
    ;(h as Headers).forEach((v, k) => (out[k.toLowerCase()] = v))
    return out
  }
  if (Array.isArray(h)) {
    for (const [k, v] of h) out[k.toLowerCase()] = String(v)
    return out
  }
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = String(v)
  return out
}

export function getHeader(h: HeadersLike | undefined | null, name: string): string | undefined {
  const map = normalizeHeaders(h)
  return map[name.toLowerCase()]
}

export function setHeader(h: HeadersLike | undefined | null, name: string, value: string): HeadersLike {
  if (!h) return { [name]: value }
  if (typeof (h as any).set === 'function') {
    const copy = new Headers(h as Headers)
    copy.set(name, value)
    return copy
  }
  const map = normalizeHeaders(h)
  map[name.toLowerCase()] = value
  return map
}

export function getContentType(h: HeadersLike | undefined | null): string | undefined {
  return getHeader(h, 'content-type')
}

export function isJsonContentType(ct?: string): boolean {
  if (!ct) return false
  return /application\/json|\+json/i.test(ct)
}

export async function parseBody(req: Request, limitBytes = 1_000_000): Promise<any> {
  const ct = getContentType(req.headers)
  if (isJsonContentType(ct)) {
    const text = await readTextLimited(req, limitBytes)
    try {
      return JSON.parse(text)
    } catch (e) {
      throw new Error('Invalid JSON body')
    }
  }
  if (/text\//i.test(ct || '')) return readTextLimited(req, limitBytes)
  // default to arrayBuffer
  const buf = await req.arrayBuffer()
  if (buf.byteLength > limitBytes) throw new Error('Body too large')
  return buf
}

export async function readTextLimited(req: Request, limitBytes: number): Promise<string> {
  const buf = await req.arrayBuffer()
  if (buf.byteLength > limitBytes) throw new Error('Body too large')
  return new TextDecoder().decode(buf)
}

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  const payload = JSON.stringify(body)
  return new Response(payload, { ...init, headers })
}

export function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    usp.append(k, String(v))
  }
  const s = usp.toString()
  return s ? `?${s}` : ''
}

export function appendQuery(url: string, params: Record<string, string | number | boolean | null | undefined>): string {
  const u = new URL(url, 'http://localhost')
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    u.searchParams.set(k, String(v))
  }
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
    // Relative URL; return pathname+search only
    return `${u.pathname}${u.search}`
  }
  return u.toString()
}

export function ensureCorrelationId(headers?: HeadersLike | null): string {
  const existing = headers && getHeader(headers, 'x-correlation-id')
  if (existing) return existing
  return randomId()
}

export function randomId(): string {
  const g: any = globalThis as any
  try {
    if (g.crypto?.randomUUID) return g.crypto.randomUUID()
  } catch {
    // ignore
  }
  try {
    if (g.crypto?.getRandomValues) {
      const bytes = new Uint8Array(16)
      g.crypto.getRandomValues(bytes)
      return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch {
    // ignore
  }
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)
}

