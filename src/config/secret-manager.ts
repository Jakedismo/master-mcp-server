import { CryptoUtils } from '../utils/crypto.js'
import { Logger } from '../utils/logger.js'

export interface SecretManagerOptions {
  // Name of env var that holds the encryption key used for configuration secrets
  keyEnvVar?: string
  // Optional explicit key value (discouraged in production)
  key?: string
}

export class SecretManager {
  private key: string

  constructor(options?: SecretManagerOptions) {
    const env = (globalThis as any)?.process?.env ?? {}
    const provided = options?.key || env[options?.keyEnvVar || 'MASTER_CONFIG_KEY'] || env.MASTER_SECRET_KEY
    const isProd = (env.NODE_ENV || env.MASTER_ENV) === 'production'
    if (!provided) {
      if (isProd) throw new Error('Missing MASTER_CONFIG_KEY for decrypting secrets in production')
      Logger.warn('MASTER_CONFIG_KEY missing; using ephemeral key (dev only)')
      this.key = CryptoUtils.generateSecureRandom(32)
    } else {
      this.key = String(provided)
    }
  }

  getKey(): string {
    return this.key
  }

  encrypt(value: string): string {
    return `enc:gcm:${CryptoUtils.encrypt(value, this.key)}`
  }

  decrypt(value: string): string {
    if (value.startsWith('enc:gcm:')) {
      const raw = value.slice('enc:gcm:'.length)
      return CryptoUtils.decrypt(raw, this.key)
    }
    return value
  }

  isEncrypted(value: string): boolean {
    return typeof value === 'string' && value.indexOf('enc:gcm:') === 0
  }

  // Resolve secret placeholders within a config object
  // - enc:gcm:<base64> → decrypted
  // - env:VARNAME → process.env[VARNAME]
  resolveSecrets<T>(obj: T): T {
    const env = (globalThis as any)?.process?.env ?? {}
    const visit = (v: any): any => {
      if (typeof v === 'string') {
        const vs: string = String(v)
        if (this.isEncrypted(vs)) return this.decrypt(vs)
        if (vs.slice(0, 4) === 'env:') return String(env[vs.slice(4)] ?? '')
        return v
      }
      if (Array.isArray(v)) return v.map((x) => visit(x))
      if (v && typeof v === 'object') {
        const out: Record<string, unknown> = {}
        for (const [k, vv] of Object.entries(v)) out[k] = visit(vv)
        return out
      }
      return v
    }
    return visit(obj)
  }

  redact<T>(obj: T): T {
    const secretKeyMatcher = /secret|token|password|key/i
    const visit = (v: any, keyHint?: string): any => {
      if (typeof v === 'string') {
        const vs: string = String(v)
        if (this.isEncrypted(vs)) return '***'
        if (keyHint && secretKeyMatcher.test(keyHint)) return '***'
        if (vs.slice(0, 4) === 'env:' && secretKeyMatcher.test(keyHint || '')) return '***'
        return v
      }
      if (Array.isArray(v)) return v.map((x) => visit(x, keyHint))
      if (v && typeof v === 'object') {
        const out: Record<string, unknown> = {}
        for (const [k, vv] of Object.entries(v)) out[k] = visit(vv, k)
        return out
      }
      return v
    }
    return visit(obj)
  }

  rotate<T extends Record<string, unknown>>(obj: T, newKey: string, secretPaths?: string[]): T {
    // Re-encrypt values under known secret paths
    const prevKey = this.key
    this.key = newKey
    const result = structuredClone(obj)
    const paths = secretPaths ?? inferSecretPaths(obj)
    for (const p of paths) {
      try {
        const cur = getByPath(result, p)
        if (typeof cur === 'string') {
          const plain = this.isEncrypted(cur) ? CryptoUtils.decrypt(cur.slice('enc:gcm:'.length), prevKey) : cur
          setByPath(result, p, this.encrypt(plain))
        }
      } catch (err) {
        Logger.warn(`Failed to rotate secret at ${p}`, String(err))
      }
    }
    return result
  }
}

function getByPath(obj: any, path: string): unknown {
  const parts = path.split('.')
  let cur = obj
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return cur
}

function setByPath(obj: any, path: string, value: unknown): void {
  const parts = path.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {}
    cur = cur[p]
  }
  cur[parts[parts.length - 1]] = value
}

function inferSecretPaths(obj: Record<string, unknown>, base = ''): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const p = base ? `${base}.${k}` : k
    if (typeof v === 'string') {
      if (/secret|token|password|key/i.test(k)) out.push(p)
      else if (v.startsWith('enc:gcm:') || v.startsWith('env:')) out.push(p)
    } else if (v && typeof v === 'object') {
      out.push(...inferSecretPaths(v as Record<string, unknown>, p))
    }
  }
  return out
}
