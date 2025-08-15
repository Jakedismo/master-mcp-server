/**
 * Lightweight metrics, health checks, and profiling utilities.
 */

export type Labels = Record<string, string>

export class Counter {
  private value = 0
  inc(delta = 1): void {
    this.value += delta
  }
  get(): number {
    return this.value
  }
}

export class Gauge {
  private value = 0
  set(v: number): void {
    this.value = v
  }
  add(delta: number): void {
    this.value += delta
  }
  get(): number {
    return this.value
  }
}

export class Histogram {
  private readonly buckets: number[]
  private counts: number[]
  private sum = 0
  constructor(buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]) {
    this.buckets = [...buckets].sort((a, b) => a - b)
    this.counts = Array(this.buckets.length + 1).fill(0)
  }
  observe(value: number): void {
    this.sum += value
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        this.counts[i]++
        return
      }
    }
    this.counts[this.counts.length - 1]++
  }
  snapshot(): { buckets: number[]; counts: number[]; sum: number } {
    return { buckets: [...this.buckets], counts: [...this.counts], sum: this.sum }
  }
}

export class MetricRegistry {
  private counters = new Map<string, Counter>()
  private gauges = new Map<string, Gauge>()
  private histograms = new Map<string, Histogram>()

  counter(name: string): Counter {
    let c = this.counters.get(name)
    if (!c) {
      c = new Counter()
      this.counters.set(name, c)
    }
    return c
  }

  gauge(name: string): Gauge {
    let g = this.gauges.get(name)
    if (!g) {
      g = new Gauge()
      this.gauges.set(name, g)
    }
    return g
  }

  histogram(name: string, buckets?: number[]): Histogram {
    let h = this.histograms.get(name)
    if (!h) {
      h = new Histogram(buckets)
      this.histograms.set(name, h)
    }
    return h
  }

  list(): { counters: Record<string, number>; gauges: Record<string, number>; histograms: Record<string, ReturnType<Histogram['snapshot']>> } {
    const counters: Record<string, number> = {}
    const gauges: Record<string, number> = {}
    const histograms: Record<string, ReturnType<Histogram['snapshot']>> = {}
    for (const [k, v] of this.counters.entries()) counters[k] = v.get()
    for (const [k, v] of this.gauges.entries()) gauges[k] = v.get()
    for (const [k, v] of this.histograms.entries()) histograms[k] = v.snapshot()
    return { counters, gauges, histograms }
  }
}

export class HealthCheckRegistry {
  private checks = new Map<string, () => Promise<{ ok: boolean; info?: unknown }>>()
  register(name: string, fn: () => Promise<{ ok: boolean; info?: unknown }>): void {
    this.checks.set(name, fn)
  }
  unregister(name: string): void {
    this.checks.delete(name)
  }
  async run(): Promise<{ status: 'ok' | 'degraded' | 'fail'; results: Record<string, { ok: boolean; info?: unknown }> }> {
    const entries: [string, { ok: boolean; info?: unknown }][] = []
    for (const [name, fn] of this.checks) {
      try {
        const res = await fn()
        entries.push([name, res])
      } catch (e) {
        entries.push([name, { ok: false, info: e instanceof Error ? e.message : String(e) }])
      }
    }
    const results = Object.fromEntries(entries)
    const oks = entries.filter(([, r]) => r.ok).length
    const status: 'ok' | 'degraded' | 'fail' = oks === entries.length ? 'ok' : oks > 0 ? 'degraded' : 'fail'
    return { status, results }
  }
}

/** Monitors event loop delay by scheduling microtasks. Returns a stop function. */
export function monitorEventLoopLag(callback: (lagMs: number) => void, intervalMs = 500): () => void {
  let timer: any
  let stopped = false
  const tick = () => {
    if (stopped) return
    const start = now()
    timer = setTimeout(() => {
      const lag = now() - start - intervalMs
      callback(Math.max(0, lag))
      tick()
    }, intervalMs)
  }
  tick()
  return () => {
    stopped = true
    if (typeof clearTimeout === 'function' && timer) clearTimeout(timer)
  }
}

export function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
  return Date.now()
}

export function collectSystemMetrics(): Record<string, unknown> {
  const g: any = globalThis as any
  const out: Record<string, unknown> = { timestamp: new Date().toISOString() }
  try {
    if (g.process?.memoryUsage) {
      const m = g.process.memoryUsage()
      out.memory = {
        rss: m.rss,
        heapTotal: m.heapTotal,
        heapUsed: m.heapUsed,
        external: m.external,
      }
    }
    if (g.os?.loadavg) {
      const l = g.os.loadavg()
      out.loadavg = { '1m': l[0], '5m': l[1], '15m': l[2] }
    }
  } catch {
    // ignore
  }
  // Workers: best-effort
  if (!out.memory && (performance as any)?.memory) {
    out.memory = (performance as any).memory
  }
  return out
}

