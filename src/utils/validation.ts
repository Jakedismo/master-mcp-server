/**
 * Validation and sanitization helpers with a small schema system.
 * No external dependencies; suitable for Node and Workers.
 */

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function sanitizeString(input: unknown, opts?: { maxLength?: number; trim?: boolean }): string {
  let s = typeof input === 'string' ? input : String(input ?? '')
  if (opts?.trim !== false) s = s.trim()
  // Remove control characters except tab, newline, carriage return
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  if (opts?.maxLength && s.length > opts.maxLength) s = s.slice(0, opts.maxLength)
  return s
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const dangerous = ['__proto__', 'constructor', 'prototype']
  for (const k of Object.keys(obj)) {
    if (dangerous.includes(k)) delete (obj as any)[k]
  }
  return obj
}

export function assert(condition: unknown, message = 'Assertion failed'): asserts condition {
  if (!condition) throw new Error(message)
}

export function assertString(value: unknown, message = 'Expected string'): asserts value is string {
  if (typeof value !== 'string') throw new Error(message)
}

export function assertNumber(value: unknown, message = 'Expected number'): asserts value is number {
  if (typeof value !== 'number' || Number.isNaN(value)) throw new Error(message)
}

export function assertBoolean(value: unknown, message = 'Expected boolean'): asserts value is boolean {
  if (typeof value !== 'boolean') throw new Error(message)
}

export type SafeParseResult<T> = { success: true; data: T } | { success: false; error: string }

export interface Schema<T> {
  parse(input: unknown): T
  safeParse(input: unknown): SafeParseResult<T>
}

function makeSchema<T>(name: string, parse: (i: unknown) => T): Schema<T> {
  return {
    parse(input: unknown): T {
      try {
        return parse(input)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`${name} validation failed: ${msg}`)
      }
    },
    safeParse(input: unknown): SafeParseResult<T> {
      try {
        return { success: true, data: parse(input) }
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
      }
    },
  }
}

export const v = {
  string: (opts?: { min?: number; max?: number; pattern?: RegExp }) =>
    makeSchema<string>('string', (i) => {
      if (typeof i !== 'string') throw new Error('not a string')
      const s = i
      if (opts?.min !== undefined && s.length < opts.min) throw new Error(`min length ${opts.min}`)
      if (opts?.max !== undefined && s.length > opts.max) throw new Error(`max length ${opts.max}`)
      if (opts?.pattern && !opts.pattern.test(s)) throw new Error('pattern mismatch')
      return s
    }),

  number: (opts?: { min?: number; max?: number; int?: boolean }) =>
    makeSchema<number>('number', (i) => {
      if (typeof i !== 'number' || Number.isNaN(i)) throw new Error('not a number')
      const n = i
      if (opts?.int) {
        if (!Number.isInteger(n)) throw new Error('not an integer')
      }
      if (opts?.min !== undefined && n < opts.min) throw new Error(`min ${opts.min}`)
      if (opts?.max !== undefined && n > opts.max) throw new Error(`max ${opts.max}`)
      return n
    }),

  boolean: () => makeSchema<boolean>('boolean', (i) => {
    if (typeof i !== 'boolean') throw new Error('not a boolean')
    return i
  }),

  literal: <T extends string | number | boolean | null>(val: T) =>
    makeSchema<T>('literal', (i) => {
      if (i !== val) throw new Error(`expected ${String(val)}`)
      return i as T
    }),

  array: <T>(inner: Schema<T>, opts?: { min?: number; max?: number }) =>
    makeSchema<T[]>('array', (i) => {
      if (!Array.isArray(i)) throw new Error('not an array')
      if (opts?.min !== undefined && i.length < opts.min) throw new Error(`min length ${opts.min}`)
      if (opts?.max !== undefined && i.length > opts.max) throw new Error(`max length ${opts.max}`)
      return i.map((x) => inner.parse(x))
    }),

  object: <S extends Record<string, Schema<any>>>(shape: S) =>
    makeSchema<{ [K in keyof S]: S[K] extends Schema<infer U> ? U : never }>('object', (i) => {
      if (!isRecord(i)) throw new Error('not an object')
      const out: Record<string, unknown> = {}
      for (const [k, s] of Object.entries(shape)) {
        out[k] = (s as Schema<unknown>).parse((i as any)[k])
      }
      return out as any
    }),

  union: <A, B>(a: Schema<A>, b: Schema<B>) =>
    makeSchema<A | B>('union', (i) => {
      const ra = a.safeParse(i)
      if (ra.success) return ra.data
      const rb = b.safeParse(i)
      if (rb.success) return rb.data
      throw new Error(`no union match: ${ra.error}; ${rb.error}`)
    }),

  optional: <T>(inner: Schema<T>) =>
    makeSchema<T | undefined>('optional', (i) => {
      if (i === undefined) return undefined
      return inner.parse(i)
    }),
}

export function isEmail(input: string): boolean {
  // Simple and conservative
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)
}

export function isUrl(input: string): boolean {
  try {
    const u = new URL(input)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function isUUID(input: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)
}

export function safeHeaderName(name: string): boolean {
  return /^[A-Za-z0-9-]+$/.test(name) && !/__/g.test(name)
}

export function safeHeaderValue(value: string): boolean {
  return !/[\r\n]/.test(value) && value.length < 8192
}

export function validateAgainstSchema<T>(schema: Schema<T>, input: unknown): T {
  return schema.parse(input)
}

