import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID as nodeRandomUUID,
  timingSafeEqual,
  pbkdf2Sync,
  scryptSync,
  hkdfSync,
} from 'node:crypto'

const IV_LENGTH = 12 // AES-GCM recommended 12 bytes
const AUTH_TAG_LENGTH = 16

function deriveKey(key: string | Buffer): Buffer {
  return Buffer.isBuffer(key) ? createHash('sha256').update(key).digest() : createHash('sha256').update(Buffer.from(key)).digest()
}

function b64(input: ArrayBuffer | Uint8Array): string {
  return Buffer.from(input as any).toString('base64')
}

function fromB64(input: string): Buffer {
  return Buffer.from(input, 'base64')
}

/**
 * Node-focused crypto utilities used by the Master MCP Server runtime.
 * Worker builds exclude this file via tsconfig.worker.json.
 */
export class CryptoUtils {
  /** Encrypts UTF-8 text using AES-256-GCM. Returns base64(iv||tag||ciphertext). */
  static encrypt(data: string, key: string | Buffer): string {
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv('aes-256-gcm', deriveKey(key), iv)
    const ciphertext = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return Buffer.concat([iv, authTag, ciphertext]).toString('base64')
  }

  /** Decrypts base64(iv||tag||ciphertext) produced by encrypt(). */
  static decrypt(encryptedData: string, key: string | Buffer): string {
    const raw = Buffer.from(encryptedData, 'base64')
    const iv = raw.subarray(0, IV_LENGTH)
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(key), iv)
    decipher.setAuthTag(authTag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return plaintext.toString('utf8')
  }

  /** Secure random bytes as hex string. */
  static generateSecureRandom(length: number): string {
    return randomBytes(length).toString('hex')
  }

  /** Returns RFC4122 v4 UUID using crypto RNG. */
  static uuid(): string {
    return nodeRandomUUID()
  }

  /** SHA-256 digest as hex string. */
  static hash(input: string | Buffer): string {
    return createHash('sha256').update(input).digest('hex')
  }

  /** Constant-time equality check for hex strings produced by hash(). */
  static verify(input: string | Buffer, hash: string): boolean {
    const calculated = Buffer.from(this.hash(input), 'utf8')
    const provided = Buffer.from(hash, 'utf8')
    if (calculated.length !== provided.length) return false
    return timingSafeEqual(calculated, provided)
  }

  /** Derives a key using PBKDF2-HMAC-SHA256. Returns base64 key bytes. */
  static pbkdf2(
    password: string | Buffer,
    salt: string | Buffer,
    iterations = 100_000,
    keyLen = 32,
  ): string {
    const dk = pbkdf2Sync(password, salt, iterations, keyLen, 'sha256')
    return b64(dk)
  }

  /**
   * Hashes password using PBKDF2. Format: pbkdf2$sha256$iter$saltB64$hashB64
   */
  static pbkdf2Hash(password: string, iterations = 100_000, saltLen = 16): string {
    const salt = randomBytes(saltLen)
    const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256')
    return `pbkdf2$sha256$${iterations}$${b64(salt)}$${b64(hash)}`
  }

  static pbkdf2Verify(password: string, encoded: string): boolean {
    try {
      const [algo, hashName, iterStr, saltB64, hashB64] = encoded.split('$')
      if (algo !== 'pbkdf2' || hashName !== 'sha256') return false
      const iterations = Number(iterStr)
      const salt = fromB64(saltB64)
      const expected = fromB64(hashB64)
      const actual = pbkdf2Sync(password, salt, iterations, expected.length, 'sha256')
      return timingSafeEqual(actual, expected)
    } catch {
      return false
    }
  }

  /**
   * Hashes password using scrypt with defaults N=16384, r=8, p=1.
   * Format: scrypt$N$r$p$saltB64$hashB64
   */
  static scryptHash(password: string, opts?: { N?: number; r?: number; p?: number; saltLen?: number; keyLen?: number }): string {
    const N = opts?.N ?? 16384
    const r = opts?.r ?? 8
    const p = opts?.p ?? 1
    const saltLen = opts?.saltLen ?? 16
    const keyLen = opts?.keyLen ?? 32
    const salt = randomBytes(saltLen)
    const hash = scryptSync(password, salt, keyLen, { N, r, p })
    return `scrypt$${N}$${r}$${p}$${b64(salt)}$${b64(hash)}`
  }

  static scryptVerify(password: string, encoded: string): boolean {
    try {
      const [algo, nStr, rStr, pStr, saltB64, hashB64] = encoded.split('$')
      if (algo !== 'scrypt') return false
      const N = Number(nStr)
      const r = Number(rStr)
      const p = Number(pStr)
      const salt = fromB64(saltB64)
      const expected = fromB64(hashB64)
      const actual = scryptSync(password, salt, expected.length, { N, r, p })
      return timingSafeEqual(actual, expected)
    } catch {
      return false
    }
  }

  /**
   * Attempts bcrypt via optional dependency. If unavailable, falls back to scrypt
   * and encodes using the scrypt$... scheme. This ensures secure hashing without
   * adding runtime deps.
   */
  static async bcryptHash(password: string, rounds = 12): Promise<string> {
    try {
      // Attempt to use optional bcrypt packages if present via dynamic import
      const mod = await dynamicImportAny(['bcrypt', 'bcryptjs'])
      if (mod?.hash) return await mod.hash(password, rounds)
    } catch {
      // ignore and fallback
    }
    // Fallback to scrypt
    return this.scryptHash(password)
  }

  static async bcryptVerify(password: string, encoded: string): Promise<boolean> {
    // If it looks like a bcrypt hash, try optional bcrypt packages
    if (encoded.startsWith('$2a$') || encoded.startsWith('$2b$') || encoded.startsWith('$2y$')) {
      try {
        const mod = await dynamicImportAny(['bcrypt', 'bcryptjs'])
        if (mod?.compare) return await mod.compare(password, encoded)
      } catch {
        // ignore and fallback
      }
      return false
    }
    // Otherwise, support scrypt fallback
    if (encoded.startsWith('scrypt$')) return this.scryptVerify(password, encoded)
    if (encoded.startsWith('pbkdf2$')) return this.pbkdf2Verify(password, encoded)
    return false
  }

  /** HKDF with SHA-256. Returns base64 key bytes. */
  static hkdf(ikm: string | Buffer, salt: string | Buffer, info: string | Buffer, length = 32): string {
    try {
      const okm = hkdfSync('sha256', ikm, salt, info, length)
      return b64(okm)
    } catch {
      // Fallback manual HKDF implementation (RFC 5869)
      const prk = createHmac('sha256', salt as any).update(ikm as any).digest()
      const n = Math.ceil(length / 32)
      const t: any[] = []
      let prev: any = Buffer.alloc(0)
      for (let i = 0; i < n; i++) {
        prev = createHmac('sha256', prk as any)
          .update(Buffer.concat([prev, Buffer.from(info as any), Buffer.from([i + 1])]) as any)
          .digest() as Buffer
        t.push(prev)
      }
      return b64(Buffer.concat(t).subarray(0, length))
    }
  }
}

async function dynamicImportAny(modules: string[]): Promise<any | null> {
  for (const m of modules) {
    try {
      // Avoid triggering TS module resolution by computing the specifier
      const importer = new Function('m', 'return import(m)') as (m: string) => Promise<any>
      const mod = await importer(m)
      if (mod) return mod.default ?? mod
    } catch {
      // continue
    }
  }
  return null
}
