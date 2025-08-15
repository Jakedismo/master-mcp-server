/**
 * Date/time utilities, duration parsing and timezone helpers.
 */

export function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
  return Date.now()
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Parses durations like "500ms", "2s", "5m", "1h", "1d". */
export function parseDuration(input: string): number {
  const m = String(input).trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/i)
  if (!m) throw new Error('Invalid duration')
  const n = parseFloat(m[1])
  const u = m[2].toLowerCase()
  switch (u) {
    case 'ms':
      return n
    case 's':
      return n * 1000
    case 'm':
      return n * 60_000
    case 'h':
      return n * 3_600_000
    case 'd':
      return n * 86_400_000
    default:
      throw new Error('Invalid duration unit')
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 2)}s`
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(ms % 60_000 === 0 ? 0 : 2)}m`
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(ms % 3_600_000 === 0 ? 0 : 2)}h`
  return `${(ms / 86_400_000).toFixed(ms % 86_400_000 === 0 ? 0 : 2)}d`
}

export function toUTC(date: Date): string {
  return date.toISOString()
}

export function fromUnix(seconds: number): Date {
  return new Date(seconds * 1000)
}

export function formatInTimeZone(date: Date, timeZone: string, opts?: Intl.DateTimeFormatOptions): string {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, ...opts })
  return formatter.format(date)
}

