import type { MasterConfig } from '../types/config.js'
import { EnvironmentManager } from './environment-manager.js'
import { SecretManager } from './secret-manager.js'
import { SchemaValidator } from './schema-validator.js'
import { Logger } from '../utils/logger.js'

type LoadOptions = {
  // Explicit path to config file; when provided, overrides environment-based discovery
  path?: string
  // Optional base directory for default and env configs
  baseDir?: string
  // Provide a schema path override
  schemaPath?: string
}

function isNode(): boolean {
  return Boolean((globalThis as any)?.process?.versions?.node)
}

export class ConfigLoader {

  static async load(options?: LoadOptions): Promise<MasterConfig> {
    const envName = EnvironmentManager.detectEnvironment()
    const platform = EnvironmentManager.detectPlatform()
    const explicit = options?.path ?? EnvironmentManager.getExplicitConfigPath()
    const baseDir = options?.baseDir ?? 'config'
    const paths = EnvironmentManager.getConfigPaths(baseDir)
    const schemaPath = options?.schemaPath ?? paths.schema

    let fileConfig: Partial<MasterConfig> = {}
    const loadedFiles: string[] = []

    if (explicit && isNode()) {
      const cfg = await this.loadFromFile(explicit)
      fileConfig = deepMerge(fileConfig, cfg)
      loadedFiles.push(explicit)
    } else if (isNode()) {
      // Load default.json then <env>.json if present
      const fs = await import('node:fs/promises')
      const fsc = await import('node:fs')
      if (paths.base && fsc.existsSync(paths.base)) {
        fileConfig = deepMerge(fileConfig, await this.loadFromFile(paths.base))
        loadedFiles.push(paths.base)
      }
      if (paths.env && fsc.existsSync(paths.env)) {
        fileConfig = deepMerge(fileConfig, await this.loadFromFile(paths.env))
        loadedFiles.push(paths.env)
      }
      // If nothing loaded and config dir doesn't exist, try a default path
      ;(void fs)
    }

    Logger.info('File config loaded', { fileConfig, loadedFiles })

    // Environment variables
    const envOverrides = EnvironmentManager.loadEnvOverrides()
    Logger.info('Environment overrides', { envOverrides })
    fileConfig = deepMerge(fileConfig, envOverrides)

    // CLI args nested overrides
    const cli = EnvironmentManager.parseCliArgs()
    Logger.info('CLI args', { cli })
    fileConfig = deepMerge(fileConfig, cli as any)

    // Ensure hosting.platform and env awareness
    const normalized: Partial<MasterConfig> = {
      ...fileConfig,
      hosting: { ...fileConfig.hosting, platform },
    }

    Logger.info('Normalized config', { normalized })

    // Schema validation and secret resolution
    const schema = await SchemaValidator.loadSchema(schemaPath)
    const validated = SchemaValidator.assertValid<MasterConfig>(normalized, schema!)
    const secrets = new SecretManager()
    const resolved = secrets.resolveSecrets(validated)

    // Cache with key based on env and paths
    // In-memory caching can be added if needed; omitted to keep memory footprint small

    Logger.info('Configuration loaded', {
      files: loadedFiles,
      platform,
      env: envName,
    })
    return resolved
  }

  static async loadFromFile(filePath: string): Promise<Partial<MasterConfig>> {
    if (!isNode()) throw new Error('File loading is only supported in Node.js runtime')
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const raw = await fs.readFile(filePath, 'utf8')
    Logger.info('Loading config from file', { filePath, raw })
    const ext = path.extname(filePath).toLowerCase()
    let parsed: any
    if (ext === '.json') parsed = JSON.parse(raw)
    else if (ext === '.yaml' || ext === '.yml') parsed = (await import('yaml')).parse(raw)
    else {
      // Fallback: try JSON then YAML
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = (await import('yaml')).parse(raw)
      }
    }
    Logger.info('Parsed config from file', { filePath, parsed })
    return parsed as Partial<MasterConfig>
  }

  static async loadFromEnv(): Promise<MasterConfig> {
    // For compatibility with older phases
    const override = EnvironmentManager.loadEnvOverrides()
    const defaults: Partial<MasterConfig> = {
      hosting: {
        platform: EnvironmentManager.detectPlatform(),
        port: (globalThis as any)?.process?.env?.PORT ? Number((globalThis as any)?.process?.env?.PORT) : 3000,
        base_url: (globalThis as any)?.process?.env?.BASE_URL,
      },
      servers: [],
      master_oauth: {
        authorization_endpoint: 'https://example.com/auth',
        token_endpoint: 'https://example.com/token',
        client_id: 'placeholder',
        redirect_uri: 'http://localhost/callback',
        scopes: ['openid'],
      },
    }
    const merged = deepMerge(defaults, override) as MasterConfig
    const schema = await SchemaValidator.loadSchema()
    return SchemaValidator.assertValid(merged, schema!)
  }
}

function deepMerge<T>(base: T, override: Partial<T>): T {
  if (Array.isArray(base) && Array.isArray(override)) return override as unknown as T
  if (base && typeof base === 'object' && override && typeof override === 'object') {
    const out: any = { ...(base as any) }
    for (const [k, v] of Object.entries(override as any)) {
      if (v === undefined) continue
      if (Array.isArray(v)) out[k] = v
      else if (typeof v === 'object' && v !== null) out[k] = deepMerge((base as any)[k], v)
      else out[k] = v
    }
    return out
  }
  return (override as T) ?? base
}
