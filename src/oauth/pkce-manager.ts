// PKCE (Proof Key for Code Exchange) manager with cross-platform support
// Generates code_verifier and S256 code_challenge and tracks them per state

export interface PkceRecord {
  verifier: string
  method: 'S256' | 'plain'
  createdAt: number
  expiresAt: number
}

export interface PkceManagerOptions {
  ttlMs?: number
}

function getCrypto(): any {
  const g: any = globalThis as any
  if (g.crypto && g.crypto.subtle && g.crypto.getRandomValues) return g.crypto as any
  // Node fallback
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = require('node:crypto')
    return nodeCrypto.webcrypto as any
  } catch {
    throw new Error('Secure crypto not available in this environment')
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = ''
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i])
  // btoa is available in browser/worker; Node 18 has global btoa via Buffer workaround
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const b64 = typeof btoa === 'function' ? btoa(str) : Buffer.from(bytes).toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function randomString(length = 64): string {
  const crypto = getCrypto()
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  // Allowed characters for verifier are [A-Z a-z 0-9 - . _ ~]
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~'
  let out = ''
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length]
  return out
}

export class PKCEManager {
  private readonly store = new Map<string, PkceRecord>()
  private readonly ttl: number

  constructor(options?: PkceManagerOptions) {
    this.ttl = options?.ttlMs ?? 10 * 60_000 // 10 minutes
  }

  async generate(state: string): Promise<{ challenge: string; method: 'S256'; verifier: string }> {
    const verifier = randomString(64)
    const challenge = await this.computeS256(verifier)
    const now = Date.now()
    this.store.set(state, {
      verifier,
      method: 'S256',
      createdAt: now,
      expiresAt: now + this.ttl,
    })
    return { challenge, method: 'S256', verifier }
  }

  getVerifier(state: string, consume = true): string | undefined {
    const rec = this.store.get(state)
    if (!rec) return undefined
    if (rec.expiresAt <= Date.now()) {
      this.store.delete(state)
      return undefined
    }
    if (consume) this.store.delete(state)
    return rec.verifier
  }

  cleanup(): void {
    const now = Date.now()
    for (const [k, v] of this.store) if (v.expiresAt <= now) this.store.delete(k)
  }

  private async computeS256(verifier: string): Promise<string> {
    const crypto = getCrypto()
    const enc = new TextEncoder().encode(verifier)
    const digest = await crypto.subtle.digest('SHA-256', enc)
    return base64UrlEncode(new Uint8Array(digest))
  }
}
