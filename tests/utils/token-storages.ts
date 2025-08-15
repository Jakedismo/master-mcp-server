import type { TokenStorage } from '../../src/auth/token-manager.js'

export class MemoryKVStorage implements TokenStorage {
  private kv = new Map<string,string>()
  async set(key: string, value: string) { this.kv.set(key, value) }
  async get(key: string) { return this.kv.get(key) }
  async delete(key: string) { this.kv.delete(key) }
  async *entries() { for (const e of this.kv.entries()) yield e }
}

export class RedisLikeStorage implements TokenStorage {
  private map = new Map<string, string>()
  async set(key: string, value: string) { this.map.set(key, value) }
  async get(key: string) { return this.map.get(key) }
  async delete(key: string) { this.map.delete(key) }
  async *entries() { for (const e of this.map.entries()) yield e }
}

