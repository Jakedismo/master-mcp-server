/**
 * String manipulation and parsing utilities.
 */

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

export function toCamelCase(input: string): string {
  return input
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (m) => m.toLowerCase())
}

export function toKebabCase(input: string): string {
  return input
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

export function toSnakeCase(input: string): string {
  return input
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

export function escapeHTML(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function joinUrlPaths(...parts: string[]): string {
  const sanitized = parts.filter(Boolean).map((p) => p.replace(/(^\/+|\/+?$)/g, ''))
  const joined = sanitized.join('/')
  return `/${joined}`.replace(/\/+$/g, '') || '/'
}

export function trimSafe(input: unknown): string {
  return String(input ?? '').trim()
}

export function truncateMiddle(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input
  if (maxLength <= 3) return input.slice(0, maxLength)
  const keep = Math.floor((maxLength - 3) / 2)
  return `${input.slice(0, keep)}...${input.slice(-keep)}`
}

export function toBase64(input: string): string {
  if (typeof btoa === 'function') return btoa(input)
  return Buffer.from(input, 'utf8').toString('base64')
}

export function fromBase64(input: string): string {
  if (typeof atob === 'function') return atob(input)
  return Buffer.from(input, 'base64').toString('utf8')
}

export function stableJSONStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key])
    return out
  }
  return value
}

export function parseBoolean(input: unknown, defaultValue = false): boolean {
  const s = String(input ?? '').trim().toLowerCase()
  if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true
  if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false
  return defaultValue
}

export function normalizeUrl(input: string): string {
  try {
    const u = new URL(input)
    u.hash = ''
    return u.toString()
  } catch {
    return input
  }
}

