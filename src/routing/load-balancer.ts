export type LoadBalancingStrategy = 'round_robin' | 'weighted' | 'health'

export interface LoadBalancingInstance {
  id: string
  weight?: number
  healthScore?: number // 0..100; higher is better
}

export interface LoadBalancerOptions {
  strategy: LoadBalancingStrategy
}

export class LoadBalancer {
  private readonly opts: Required<LoadBalancerOptions>
  private rrIndex: Map<string, number> = new Map()

  constructor(options?: Partial<LoadBalancerOptions>) {
    this.opts = { strategy: options?.strategy ?? 'round_robin' }
  }

  select<T extends LoadBalancingInstance>(key: string, instances: T[]): T | undefined {
    if (!instances.length) return undefined
    switch (this.opts.strategy) {
      case 'weighted':
        return this.selectWeighted(instances)
      case 'health':
        return this.selectHealth(instances, key)
      case 'round_robin':
      default:
        return this.selectRoundRobin(key, instances)
    }
  }

  private selectRoundRobin<T extends LoadBalancingInstance>(key: string, instances: T[]): T {
    const idx = this.rrIndex.get(key) ?? 0
    const chosen = instances[idx % instances.length]
    this.rrIndex.set(key, (idx + 1) % instances.length)
    return chosen
  }

  private selectWeighted<T extends LoadBalancingInstance>(instances: T[]): T {
    const weights = instances.map((i) => Math.max(1, Math.floor(i.weight ?? 1)))
    const total = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    for (let i = 0; i < instances.length; i++) {
      if (r < weights[i]) return instances[i]
      r -= weights[i]
    }
    return instances[0]
  }

  private selectHealth<T extends LoadBalancingInstance>(instances: T[], key: string): T {
    // Choose highest health; tie-break with RR for stability
    const sorted = [...instances].sort((a, b) => (b.healthScore ?? 0) - (a.healthScore ?? 0))
    const topScore = sorted[0].healthScore ?? 0
    const top = sorted.filter((i) => (i.healthScore ?? 0) === topScore)
    if (top.length === 1) return top[0]
    return this.selectRoundRobin(key + '::health', top)
  }
}
