import type { OAuthToken } from '../types/auth.js'
import { CryptoUtils } from '../utils/crypto.js'
import { Logger } from '../utils/logger.js'

export interface TokenStorage {
  set(key: string, value: string): Promise<void> | void
  get(key: string): Promise<string | undefined> | string | undefined
  delete(key: string): Promise<void> | void
  entries(): AsyncIterable<[string, string]> | Iterable<[string, string]>
}

class InMemoryTokenStorage implements TokenStorage {
  private map = new Map<string, string>()

  set(key: string, value: string): void {
    this.map.set(key, value)
  }
  get(key: string): string | undefined {
    return this.map.get(key)
  }
  delete(key: string): void {
    this.map.delete(key)
  }
  *entries(): Iterable<[string, string]> {
    yield* this.map.entries()
  }
}

export class TokenManager {
  private readonly storage: TokenStorage
  private readonly encKey: string

  constructor(options?: { storage?: TokenStorage; secret?: string }) {
    this.storage = options?.storage ?? autoDetectStorage()
    const g: any = globalThis as any
    const env = (g?.process?.env ?? g?.__WORKER_ENV ?? {}) as Record<string, string>
    const provided = options?.secret ?? (env as any).TOKEN_ENC_KEY

    if (!provided) {
      const envName = ((g?.process?.env ?? (g?.__WORKER_ENV ?? {})) as any).NODE_ENV ?? 'development'
      if (envName === 'production') {
        throw new Error('TOKEN_ENC_KEY is required in production for secure token storage')
      }
      Logger.warn('TOKEN_ENC_KEY missing; generating ephemeral dev key (tokens won\'t persist across restarts)')
      this.encKey = CryptoUtils.generateSecureRandom(32)
    } else {
      this.encKey = provided
    }
  }

  async storeToken(key: string, token: OAuthToken): Promise<void> {
    const serialized = JSON.stringify(token)
    const encrypted = CryptoUtils.encrypt(serialized, this.encKey)
    await this.storage.set(key, encrypted)
  }

  async getToken(key: string): Promise<OAuthToken | null> {
    const encrypted = await this.storage.get(key)
    if (!encrypted) return null
    try {
      const decrypted = CryptoUtils.decrypt(encrypted, this.encKey)
      return JSON.parse(decrypted) as OAuthToken
    } catch (err) {
      Logger.error('Failed to decrypt token; deleting corrupted entry', { key, err: String(err) })
      await this.storage.delete(key)
      return null
    }
  }

  async cleanupExpiredTokens(): Promise<void> {
    const now = Date.now()
    for await (const [k, v] of this.storage.entries() as AsyncIterable<[string, string]>) {
      try {
        const tok = JSON.parse(CryptoUtils.decrypt(v, this.encKey)) as OAuthToken
        if (typeof tok.expires_at === 'number' && tok.expires_at <= now) {
          await this.storage.delete(k)
        }
      } catch {
        await this.storage.delete(k)
      }
    }
  }

  generateState(data: unknown): string {
    const payload = JSON.stringify({ d: data, t: Date.now() })
    return CryptoUtils.encrypt(payload, this.encKey)
  }

  validateState(state: string, expectedData: unknown): boolean {
    try {
      const payload = JSON.parse(CryptoUtils.decrypt(state, this.encKey)) as { d: unknown }
      return JSON.stringify(payload.d) === JSON.stringify(expectedData)
    } catch {
      return false
    }
  }
}

export { InMemoryTokenStorage }

/**
 * Auto-detects the best available storage backend.
 * - Cloudflare Workers: KV namespace bound as `TOKENS`
 * - Fallback: in-memory (non-persistent)
 */
function autoDetectStorage(): TokenStorage {
  const g: any = globalThis as any
  const env = g.__WORKER_ENV || {}
  const kv = env.TOKENS || g.TOKENS || g.TOKENS_KV
  if (kv && typeof kv.get === 'function' && typeof kv.put === 'function' && typeof kv.delete === 'function') {
    return new KVTokenStorage(kv)
  }
  return new InMemoryTokenStorage()
}

class KVTokenStorage implements TokenStorage {
  constructor(private readonly kv: { get: (k: string) => Promise<string | null>; put: (k: string, v: string, opts?: any) => Promise<void>; delete: (k: string) => Promise<void>; list?: (opts?: any) => Promise<{ keys: { name: string }[] }> }) {}
  async set(key: string, value: string): Promise<void> {
    await this.kv.put(key, value)
  }
  async get(key: string): Promise<string | undefined> {
    const v = await this.kv.get(key)
    return v === null ? undefined : v
  }
  async delete(key: string): Promise<void> {
    await this.kv.delete(key)
  }
  async *entries(): AsyncIterable<[string, string]> {
    if (typeof this.kv.list === 'function') {
      const { keys } = await this.kv.list()
      for (const k of keys) {
        const v = await this.kv.get(k.name)
        if (v !== null) yield [k.name, v]
      }
    } else {
      // KV without list support: nothing to iterate
      return
    }
  }
}
