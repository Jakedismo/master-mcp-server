import { Logger } from '../utils/logger.js'

export type CircuitState = 'closed' | 'open' | 'half_open'

export interface CircuitRecord {
  state: CircuitState
  failures: number
  successes: number
  nextTryAt: number // epoch ms when half-open trial is permitted
  openedAt?: number
  halfOpenInProgress?: boolean
}

export interface CircuitBreakerOptions {
  failureThreshold: number // failures before opening circuit
  successThreshold: number // successes in half-open before closing
  recoveryTimeoutMs: number // time to wait before permitting a half-open trial
  name?: string
}

export interface CircuitStorage {
  get(key: string): CircuitRecord | undefined
  set(key: string, value: CircuitRecord): void
  delete?(key: string): void
}

export class InMemoryCircuitStorage implements CircuitStorage {
  private readonly map = new Map<string, CircuitRecord>()
  get(key: string): CircuitRecord | undefined {
    return this.map.get(key)
  }
  set(key: string, value: CircuitRecord): void {
    this.map.set(key, value)
  }
  delete(key: string): void {
    this.map.delete(key)
  }
}

export class CircuitOpenError extends Error {
  readonly retryAfterMs?: number
  constructor(message: string, retryAfterMs?: number) {
    super(message)
    this.name = 'CircuitOpenError'
    this.retryAfterMs = retryAfterMs
  }
}

export class CircuitBreaker {
  private readonly storage: CircuitStorage
  private readonly opts: Required<CircuitBreakerOptions>

  constructor(options?: Partial<CircuitBreakerOptions>, storage?: CircuitStorage) {
    this.opts = {
      failureThreshold: options?.failureThreshold ?? 5,
      successThreshold: options?.successThreshold ?? 2,
      recoveryTimeoutMs: options?.recoveryTimeoutMs ?? 30_000,
      name: options?.name ?? 'default',
    }
    this.storage = storage ?? new InMemoryCircuitStorage()
  }

  private now(): number {
    return Date.now()
  }

  private initial(): CircuitRecord {
    return { state: 'closed', failures: 0, successes: 0, nextTryAt: 0 }
  }

  private getRecord(key: string): CircuitRecord {
    return this.storage.get(key) ?? this.initial()
  }

  canExecute(key: string): { allowed: boolean; state: CircuitState; retryAfterMs?: number } {
    const rec = this.getRecord(key)
    const now = this.now()
    if (rec.state === 'open') {
      if (now >= rec.nextTryAt && !rec.halfOpenInProgress) {
        rec.state = 'half_open'
        rec.halfOpenInProgress = true
        rec.successes = 0
        this.storage.set(key, rec)
        return { allowed: true, state: rec.state }
      }
      return { allowed: false, state: 'open', retryAfterMs: Math.max(0, rec.nextTryAt - now) }
    }
    if (rec.state === 'half_open') {
      // Only permit one in-flight trial at a time
      if (rec.halfOpenInProgress) return { allowed: false, state: 'half_open', retryAfterMs: this.opts.recoveryTimeoutMs }
      rec.halfOpenInProgress = true
      this.storage.set(key, rec)
      return { allowed: true, state: rec.state }
    }
    return { allowed: true, state: rec.state }
  }

  onSuccess(key: string): void {
    const rec = this.getRecord(key)
    if (rec.state === 'half_open') {
      rec.successes += 1
      rec.halfOpenInProgress = false
      if (rec.successes >= this.opts.successThreshold) {
        // Close the circuit after consecutive successes
        this.storage.set(key, this.initial())
        Logger.debug(`[Circuit] CLOSED after half-open successes`, { key, name: this.opts.name })
        return
      }
      this.storage.set(key, rec)
      return
    }
    // Closed state: reset failures on success
    rec.failures = 0
    this.storage.set(key, rec)
  }

  onFailure(key: string, _error?: unknown): void {
    const rec = this.getRecord(key)
    const now = this.now()
    if (rec.state === 'half_open') {
      // Failure during half-open => immediately open again
      rec.state = 'open'
      rec.failures = this.opts.failureThreshold
      rec.successes = 0
      rec.openedAt = now
      rec.nextTryAt = now + this.opts.recoveryTimeoutMs
      rec.halfOpenInProgress = false
      this.storage.set(key, rec)
      Logger.debug(`[Circuit] RE-OPEN after half-open failure`, { key, name: this.opts.name })
      return
    }

    rec.failures += 1
    if (rec.failures >= this.opts.failureThreshold) {
      rec.state = 'open'
      rec.openedAt = now
      rec.nextTryAt = now + this.opts.recoveryTimeoutMs
      this.storage.set(key, rec)
      Logger.debug(`[Circuit] OPEN due to failures`, { key, name: this.opts.name, failures: rec.failures })
    } else {
      this.storage.set(key, rec)
    }
  }

  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const gate = this.canExecute(key)
    if (!gate.allowed) throw new CircuitOpenError('Circuit open', gate.retryAfterMs)
    try {
      const result = await fn()
      this.onSuccess(key)
      return result
    } catch (err) {
      this.onFailure(key, err)
      throw err
    }
  }
}

