import type { MasterConfig } from '../types/config.js'
import { Logger } from '../utils/logger.js'

type JSONSchema = {
  $id?: string
  type?: string | string[]
  properties?: Record<string, JSONSchema>
  required?: string[]
  additionalProperties?: boolean
  enum?: unknown[]
  items?: JSONSchema
  format?: 'url' | 'secret' | 'integer'
  anyOf?: JSONSchema[]
  allOf?: JSONSchema[]
  description?: string
}

export interface SchemaValidationError {
  path: string
  message: string
}

export class SchemaValidator {
  // Lightweight JSON Schema validator supporting core features used by our config schema
  static async loadSchema(schemaPath?: string): Promise<JSONSchema | undefined> {
    if (!schemaPath) return defaultSchema
    try {
      const isNode = Boolean((globalThis as any)?.process?.versions?.node)
      if (!isNode) return defaultSchema
      const fs = await import('node:fs/promises')
      const raw = await fs.readFile(schemaPath, 'utf8')
      return JSON.parse(raw) as JSONSchema
    } catch (err) {
      Logger.warn(`Failed to read schema at ${schemaPath}; using built-in`, String(err))
      return defaultSchema
    }
  }

  static validate(config: unknown, schema: JSONSchema): { valid: boolean; errors: SchemaValidationError[] } {
    const errors: SchemaValidationError[] = []
    validateAgainst(config, schema, '', errors)
    return { valid: errors.length === 0, errors }
  }

  static assertValid<T = MasterConfig>(config: unknown, schema: JSONSchema): T {
    const { valid, errors } = this.validate(config, schema)
    if (!valid) {
      const msg = errors.map((e) => `${e.path || '<root>'}: ${e.message}`).join('\n')
      throw new Error(`Configuration validation failed:\n${msg}`)
    }
    return config as T
  }
}

function typeOf(val: unknown): string {
  if (Array.isArray(val)) return 'array'
  return typeof val
}

function validateAgainst(value: unknown, schema: JSONSchema, path: string, errors: SchemaValidationError[]): void {
  if (!schema) return
  // Type check
  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type]
    const actual = typeOf(value)
    if (!allowed.includes(actual)) {
      errors.push({ path, message: `expected type ${allowed.join('|')}, got ${actual}` })
      return
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({ path, message: `must be one of ${schema.enum.join(', ')}` })
  }

  if (schema.format) {
    if (schema.format === 'url' && typeof value === 'string') {
      try {
        // eslint-disable-next-line no-new
        new URL(value)
      } catch {
        errors.push({ path, message: 'must be a valid URL' })
      }
    }
    if (schema.format === 'integer' && typeof value === 'number') {
      if (!Number.isInteger(value)) errors.push({ path, message: 'must be an integer' })
    }
  }

  if (schema.properties && value && typeof value === 'object' && !Array.isArray(value)) {
    const v = value as Record<string, unknown>
    const required = schema.required || []
    for (const r of required) {
      if (!(r in v)) errors.push({ path: join(path, r), message: 'is required' })
    }
    for (const [k, subschema] of Object.entries(schema.properties)) {
      if (k in v) validateAgainst(v[k], subschema, join(path, k), errors)
    }
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(v)) {
        if (!schema.properties[k]) errors.push({ path: join(path, k), message: 'is not allowed' })
      }
    }
  }

  if (schema.items && Array.isArray(value)) {
    value.forEach((item, idx) => validateAgainst(item, schema.items!, join(path, String(idx)), errors))
  }

  if (schema.allOf) {
    for (const s of schema.allOf) validateAgainst(value, s, path, errors)
  }
  if (schema.anyOf) {
    const ok = schema.anyOf.some((s) => {
      const temp: SchemaValidationError[] = []
      validateAgainst(value, s, path, temp)
      return temp.length === 0
    })
    if (!ok) errors.push({ path, message: 'does not match any allowed schema' })
  }
}

function join(base: string, key: string): string {
  return base ? `${base}.${key}` : key
}

// Built-in fallback schema captures core fields and constraints.
const defaultSchema: JSONSchema = {
  type: 'object',
  required: ['master_oauth', 'hosting', 'servers'],
  properties: {
    master_oauth: {
      type: 'object',
      required: ['authorization_endpoint', 'token_endpoint', 'client_id', 'redirect_uri', 'scopes'],
      properties: {
        issuer: { type: 'string' },
        authorization_endpoint: { type: 'string', format: 'url' },
        token_endpoint: { type: 'string', format: 'url' },
        jwks_uri: { type: 'string' },
        client_id: { type: 'string' },
        client_secret: { type: 'string' },
        redirect_uri: { type: 'string' },
        scopes: { type: 'array', items: { type: 'string' } },
        audience: { type: 'string' },
      },
      additionalProperties: true,
    },
    hosting: {
      type: 'object',
      required: ['platform'],
      properties: {
        platform: { type: 'string', enum: ['node', 'cloudflare-workers', 'koyeb', 'docker', 'unknown'] },
        port: { type: 'number', format: 'integer' },
        base_url: { type: 'string' },
      },
      additionalProperties: true,
    },
    logging: {
      type: 'object',
      properties: { level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] } },
    },
    routing: {
      type: 'object',
      properties: {
        loadBalancer: { type: 'object', properties: { strategy: { type: 'string' } }, additionalProperties: true },
        circuitBreaker: { type: 'object', additionalProperties: true },
        retry: { type: 'object', additionalProperties: true },
      },
      additionalProperties: true,
    },
    servers: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'type', 'auth_strategy', 'config'],
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['git', 'npm', 'pypi', 'docker', 'local'] },
          url: { type: 'string' },
          package: { type: 'string' },
          version: { type: 'string' },
          branch: { type: 'string' },
          auth_strategy: {
            type: 'string',
            enum: ['master_oauth', 'delegate_oauth', 'bypass_auth', 'proxy_oauth'],
          },
          auth_config: { type: 'object', additionalProperties: true },
          config: {
            type: 'object',
            properties: {
              environment: { type: 'object', additionalProperties: true },
              args: { type: 'array', items: { type: 'string' } },
              port: { type: 'number', format: 'integer' },
            },
            additionalProperties: true,
          },
        },
        additionalProperties: true,
      },
    },
  },
  additionalProperties: true,
}
