/**
 * Simple in-memory TTL cache with optional memoization helpers.
 */

export interface CacheEntry<V> {
  value: V
  expiresAt: number
}

export class TTLCache<K, V> {
  private store = new Map<K, CacheEntry<V>>()
  constructor(private defaultTtlMs = 60_000) {}

  set(key: K, value: V, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs
    const expiresAt = Date.now() + ttl
    this.store.set(key, { value, expiresAt })
  }

  get(key: K): V | undefined {
    const hit = this.store.get(key)
    if (!hit) return undefined
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key)
      return undefined
    }
    return hit.value
  }

  has(key: K): boolean {
    return this.get(key) !== undefined
  }

  delete(key: K): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  size(): number {
    return this.store.size
  }

  sweep(): void {
    const now = Date.now()
    for (const [k, v] of this.store.entries()) {
      if (v.expiresAt < now) this.store.delete(k)
    }
  }

  async getOrSet(key: K, loader: () => Promise<V>, ttlMs?: number): Promise<V> {
    const existing = this.get(key)
    if (existing !== undefined) return existing
    const v = await loader()
    this.set(key, v, ttlMs)
    return v
  }
}

export function memoizeAsync<A extends unknown[], R>(fn: (...args: A) => Promise<R>, ttlMs = 60_000): (...args: A) => Promise<R> {
  const cache = new TTLCache<string, R>(ttlMs)
  return async (...args: A) => {
    const key = JSON.stringify(args)
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    const res = await fn(...args)
    cache.set(key, res, ttlMs)
    return res
  }
}

