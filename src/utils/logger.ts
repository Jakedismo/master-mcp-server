import type { AuthInfo } from '../types/auth.js'

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

export interface LogFields {
  [key: string]: unknown
  correlationId?: string
}

interface LoggerOptions {
  level?: LogLevel
  json?: boolean
  base?: LogFields
}

/**
 * Lightweight, structured, context-aware logger with JSON output support and
 * timing utilities. Designed to run on Node.js and Workers without deps.
 */
export class Logger {
  private static level: LogLevel = ((): LogLevel => {
    const env = (globalThis as any)?.process?.env
    const raw = (env?.LOG_LEVEL || env?.NODE_LOG_LEVEL || 'info').toLowerCase()
    const allowed: LogLevel[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']
    return (allowed.includes(raw as LogLevel) ? (raw as LogLevel) : 'info') as LogLevel
  })()

  private static json: boolean = ((): boolean => {
    const env = (globalThis as any)?.process?.env
    const raw = env?.LOG_FORMAT || env?.LOG_JSON
    if (!raw) return (env?.NODE_ENV === 'production') as boolean
    return String(raw).toLowerCase() === 'true' || String(raw).toLowerCase() === 'json'
  })()

  private static base: LogFields = {}

  static configure(opts: LoggerOptions): void {
    if (opts.level) this.level = opts.level
    if (typeof opts.json === 'boolean') this.json = opts.json
    if (opts.base) this.base = { ...this.base, ...sanitizeFields(opts.base) }
  }

  static with(fields: LogFields): typeof Logger {
    const merged = { ...this.base, ...sanitizeFields(fields) }
    const child = new Proxy(this, {
      get: (target, prop) => {
        if (prop === 'base') return merged
        return (target as any)[prop]
      },
    }) as typeof Logger
    return child
  }

  static setLevel(level: LogLevel): void {
    this.level = level
  }

  static enableJSON(enabled: boolean): void {
    this.json = enabled
  }

  static getLevel(): LogLevel {
    return this.level
  }

  static trace(message: string, fields?: LogFields | unknown): void {
    const f = fieldsToLogFields(fields)
    this._log('trace', message, f)
  }
  static debug(message: string, fields?: LogFields | unknown): void {
    const envDebug = (globalThis as any)?.process?.env?.DEBUG
    const f = fieldsToLogFields(fields)
    if (envDebug || this.levelAllowed('debug')) this._log('debug', message, f)
  }
  static info(message: string, fields?: LogFields | unknown): void {
    const f = fieldsToLogFields(fields)
    this._log('info', message, f)
  }
  static warn(message: string, fields?: LogFields | unknown): void {
    const f = fieldsToLogFields(fields)
    this._log('warn', message, f)
  }
  static error(message: string, fields?: LogFields | unknown): void {
    const f = fieldsToLogFields(fields)
    this._log('error', message, f)
  }
  static fatal(message: string, fields?: LogFields | unknown): void {
    const f = fieldsToLogFields(fields)
    this._log('fatal', message, f)
  }

  /**
   * Structured auth event helper for backward compatibility.
   */
  static logAuthEvent(event: string, context: AuthInfo): void {
    this.info('auth_event', { event, ...context })
  }

  /**
   * Structured server event helper for backward compatibility.
   */
  static logServerEvent(event: string, serverId: string, context?: unknown): void {
    const fields = fieldsToLogFields(context)
    this.info('server_event', { event, serverId, ...(fields ?? {}) })
  }

  /**
   * Starts a performance timer, returning a function to log completion.
   *
   * Usage:
   * const done = Logger.time('load_config', { id })
   * ...work...
   * done({ status: 'ok' })
   */
  static time(name: string, fields?: LogFields): (extra?: LogFields) => void {
    const start = now()
    const base = { name, ...(fields ? sanitizeFields(fields) : {}) }
    return (extra?: LogFields) => {
      const durationMs = Math.max(0, now() - start)
      this.info('perf', { ...base, ...(extra ? sanitizeFields(extra) : {}), durationMs })
    }
  }

  /**
   * Low-level log method honoring level and output format.
   */
  private static _log(level: LogLevel, message: string, fields?: LogFields): void {
    if (!this.levelAllowed(level)) return
    const ts = new Date().toISOString()
    const entry = {
      ts,
      level,
      msg: message,
      ...this.base,
      ...(fields ? sanitizeFields(fields) : {}),
    }

    // eslint-disable-next-line no-console
    if (this.json) console.log(JSON.stringify(entry))
    else console.log(formatHuman(entry))
  }

  private static levelAllowed(check: LogLevel): boolean {
    const order: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
    const curIdx = order.indexOf(this.level)
    const chkIdx = order.indexOf(check)
    return chkIdx >= curIdx
  }
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function sanitizeFields(fields: LogFields): LogFields {
  const out: LogFields = {}
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue
    if (v instanceof Error) {
      out[k] = {
        name: v.name,
        message: v.message,
        stack: v.stack,
      }
    } else if (typeof v === 'object' && v !== null) {
      try {
        // Avoid circular structures
        out[k] = JSON.parse(JSON.stringify(v))
      } catch {
        out[k] = String(v)
      }
    } else {
      out[k] = v as any
    }
  }
  return out
}

function formatHuman(entry: { [k: string]: unknown }): string {
  const { ts, level, msg, ...rest } = entry as any
  const head = `[${String(level).toUpperCase()}] ${ts} ${msg}`
  const restKeys = Object.keys(rest)
  if (restKeys.length === 0) return head
  return `${head} ${safeStringify(rest)}`
}

function safeStringify(obj: any): string {
  try {
    return JSON.stringify(obj)
  } catch {
    return '[object]'
  }
}

function fieldsToLogFields(f?: LogFields | unknown): LogFields | undefined {
  if (!f) return undefined
  if (typeof f === 'object' && !(f instanceof Error)) return f as LogFields
  return { detail: f }
}
