import { Logger } from '../utils/logger.js'

export type JitterMode = 'none' | 'full'

export interface RetryPolicy {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  backoffFactor: number // multiplier per attempt
  jitter: JitterMode
  timeoutMs?: number // overall timeout budget (optional)
  retryOn?: {
    networkErrors?: boolean
    httpStatuses?: number[]
    httpStatusClasses?: Array<4 | 5> // 4=4xx,5=5xx
  }
}

export interface RetryContext {
  attempt: number
  lastError?: unknown
  lastStatus?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function withJitter(base: number, mode: JitterMode): number {
  if (mode === 'none') return base
  // Full jitter: random between 0 and base
  return Math.floor(Math.random() * base)
}

function isRetryable(policy: RetryPolicy, _err: unknown, status?: number): boolean {
  if (status !== undefined) {
    if (policy.retryOn?.httpStatuses?.includes(status)) return true
    const klass = Math.floor(status / 100)
    if (klass === 5 && policy.retryOn?.httpStatusClasses?.includes(5)) return true
    if (klass === 4 && policy.retryOn?.httpStatusClasses?.includes(4)) return status === 408 || status === 429
    return false
  }
  // No status means a network error or thrown exception from fetch
  return Boolean(policy.retryOn?.networkErrors ?? true)
}

export class RetryHandler {
  private readonly policy: RetryPolicy

  constructor(policy?: Partial<RetryPolicy>) {
    this.policy = {
      maxRetries: policy?.maxRetries ?? 3,
      baseDelayMs: policy?.baseDelayMs ?? 200,
      maxDelayMs: policy?.maxDelayMs ?? 5_000,
      backoffFactor: policy?.backoffFactor ?? 2,
      jitter: policy?.jitter ?? 'full',
      timeoutMs: policy?.timeoutMs,
      retryOn: policy?.retryOn ?? { networkErrors: true, httpStatusClasses: [5], httpStatuses: [408, 429] },
    }
  }

  async execute<T>(op: () => Promise<T>, onRetry?: (ctx: RetryContext) => void): Promise<T> {
    const start = Date.now()
    let delay = this.policy.baseDelayMs
    let lastError: unknown
    for (let attempt = 0; attempt <= this.policy.maxRetries; attempt++) {
      try {
        const result = await op()
        return result
      } catch (err: any) {
        // If this looks like a fetch Response-like error, extract status
        let status: number | undefined
        if (err && typeof err === 'object' && 'status' in err && typeof (err as any).status === 'number') {
          status = (err as any).status
        }

        if (attempt >= this.policy.maxRetries || !isRetryable(this.policy, err, status)) {
          throw err
        }

        lastError = err
        const ctx: RetryContext = { attempt, lastError, lastStatus: status }
        try {
          onRetry?.(ctx)
        } catch { /* ignore */ }

        if (this.policy.timeoutMs && Date.now() - start + delay > this.policy.timeoutMs) {
          Logger.warn('Retry timeout budget exceeded')
          throw err
        }

        const wait = Math.min(this.policy.maxDelayMs, withJitter(delay, this.policy.jitter))
        await sleep(wait)
        delay = Math.min(this.policy.maxDelayMs, Math.floor(delay * this.policy.backoffFactor))
      }
    }
    // Should be unreachable
    throw lastError ?? new Error('RetryHandler failed without error')
  }
}
