import type { LoadedServer, ServerInstance } from '../types/server.js'
import { Logger } from '../utils/logger.js'
import { CircuitBreaker } from './circuit-breaker.js'
import { LoadBalancer } from './load-balancer.js'

export interface RouteRegistryOptions {
  // Mapping lifetime for cached routes (ms)
  cacheTtlMs?: number
}

export interface RouteResolution {
  serverId: string
  instance: ServerInstance
}

export class RouteRegistry {
  private readonly servers: Map<string, LoadedServer>
  private readonly circuit: CircuitBreaker
  private readonly lb: LoadBalancer
  private readonly cacheTtl: number
  private cache = new Map<string, { value: RouteResolution; expiresAt: number }>()

  constructor(
    servers: Map<string, LoadedServer>,
    circuit: CircuitBreaker,
    lb: LoadBalancer,
    options?: RouteRegistryOptions
  ) {
    this.servers = servers
    this.circuit = circuit
    this.lb = lb
    this.cacheTtl = options?.cacheTtlMs ?? 5_000
  }

  updateServers(servers: Map<string, LoadedServer>): void {
    // Shallow replace reference
    ;(this as any).servers = servers
    this.cache.clear()
  }

  getInstances(serverId: string): ServerInstance[] {
    const server = this.servers.get(serverId)
    if (!server) return []
    const instances = server.instances && server.instances.length
      ? server.instances
      : (server.endpoint && server.endpoint !== 'unknown'
        ? [{ id: `${serverId}-primary`, url: server.endpoint, weight: 1, healthScore: server.status === 'running' ? 100 : 0 }]
        : [])
    return instances
  }

  resolve(serverId: string): RouteResolution | undefined {
    const cached = this.cache.get(serverId)
    const now = Date.now()
    if (cached && cached.expiresAt > now) return cached.value

    const instances = this.getInstances(serverId)
    if (!instances.length) return undefined

    // Filter by circuit breaker allowance
    const allowed = instances.filter((i) => this.circuit.canExecute(this.key(serverId, i.id)).allowed)
    const pool = allowed.length ? allowed : instances
    const chosen = this.lb.select(serverId, pool)
    if (!chosen) return undefined

    const resolution: RouteResolution = { serverId, instance: chosen }
    this.cache.set(serverId, { value: resolution, expiresAt: now + this.cacheTtl })
    return resolution
  }

  markSuccess(serverId: string, instanceId: string): void {
    const key = this.key(serverId, instanceId)
    this.circuit.onSuccess(key)
    this.bumpHealth(serverId, instanceId, +5)
  }

  markFailure(serverId: string, instanceId: string): void {
    const key = this.key(serverId, instanceId)
    this.circuit.onFailure(key)
    this.bumpHealth(serverId, instanceId, -20)
  }

  private key(serverId: string, instanceId: string): string {
    return `${serverId}::${instanceId}`
  }

  private bumpHealth(serverId: string, instanceId: string, delta: number): void {
    const s = this.servers.get(serverId)
    if (!s) return
    const arr = s.instances
    if (!arr) return
    const inst = arr.find((i) => i.id === instanceId)
    if (!inst) return
    const prev = inst.healthScore ?? 50
    const next = Math.max(0, Math.min(100, prev + delta))
    inst.healthScore = next
    Logger.debug('Instance health updated', { serverId, instanceId, healthScore: next })
  }
}

