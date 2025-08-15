/**
 * Development and debugging helpers.
 */

export function isDev(): boolean {
  const env = (globalThis as any)?.process?.env
  return env?.NODE_ENV !== 'production'
}

export function debugLog(...args: unknown[]): void {
  if (!isDev()) return
  // eslint-disable-next-line no-console
  console.debug('[DEV]', ...args)
}

export function invariant(condition: unknown, message = 'Invariant failed'): asserts condition {
  if (!condition) throw new Error(message)
}

export function assertNever(x: never, message = 'Unexpected object'): never {
  throw new Error(`${message}: ${String(x)}`)
}

export function pretty(value: unknown): string {
  try {
    const util = (globalThis as any).require ? (globalThis as any).require('node:util') : undefined
    if (util?.inspect) return util.inspect(value, { depth: 4, colors: true })
  } catch {
    // ignore
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function deprecate(fn: (...args: any[]) => any, message: string): (...args: any[]) => any {
  let warned = false
  return (...args: any[]) => {
    if (!warned) {
      warned = true
      // eslint-disable-next-line no-console
      console.warn(`[DEPRECATED] ${message}`)
    }
    return fn(...args)
  }
}

export function withTiming<T>(name: string, fn: () => T): { result: T; durationMs: number; name: string } {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const result = fn()
  const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start
  return { result, durationMs, name }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms))
}

export function mockRandom(fn: () => number): () => void {
  const original = Math.random
  ;(Math as any).random = fn
  return () => {
    ;(Math as any).random = original
  }
}
