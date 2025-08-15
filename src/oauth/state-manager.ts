// State Manager for OAuth CSRF protection
// Generates random opaque state tokens and tracks associated payload with TTL

export interface OAuthStatePayload {
  provider?: string
  serverId?: string
  clientToken?: string
  returnTo?: string
  issuedAt: number
}

export interface StateRecord {
  payload: OAuthStatePayload
  expiresAt: number
}

export interface StateManagerOptions {
  ttlMs?: number
}

function getCrypto(): any {
  const g: any = globalThis as any
  if (g.crypto && g.crypto.subtle && g.crypto.getRandomValues) return g.crypto as any
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = require('node:crypto')
    return nodeCrypto.webcrypto as any
  } catch {
    throw new Error('Secure crypto not available in this environment')
  }
}

function randomId(bytes = 32): string {
  const crypto = getCrypto()
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  let str = ''
  for (let i = 0; i < arr.length; i++) str += arr[i].toString(16).padStart(2, '0')
  return str
}

export class StateManager {
  private readonly store = new Map<string, StateRecord>()
  private readonly ttl: number

  constructor(options?: StateManagerOptions) {
    this.ttl = options?.ttlMs ?? 10 * 60_000
  }

  create(payload: Omit<OAuthStatePayload, 'issuedAt'>): string {
    const state = randomId(32)
    const now = Date.now()
    this.store.set(state, { payload: { ...payload, issuedAt: now }, expiresAt: now + this.ttl })
    return state
  }

  consume(state: string): OAuthStatePayload | null {
    const rec = this.store.get(state)
    if (!rec) return null
    this.store.delete(state)
    if (rec.expiresAt <= Date.now()) return null
    return rec.payload
  }

  peek(state: string): OAuthStatePayload | null {
    const rec = this.store.get(state)
    if (!rec || rec.expiresAt <= Date.now()) return null
    return rec.payload
  }

  cleanup(): void {
    const now = Date.now()
    for (const [k, v] of this.store) if (v.expiresAt <= now) this.store.delete(k)
  }
}
