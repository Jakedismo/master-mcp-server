import type { HostingConfig, MasterConfig } from '../types/config.js'
import { Logger } from '../utils/logger.js'

export type EnvironmentName = 'development' | 'staging' | 'production' | 'test'

function isNode(): boolean {
  return Boolean((globalThis as any)?.process?.versions?.node)
}

export class EnvironmentManager {
  static detectEnvironment(): EnvironmentName {
    const env = ((globalThis as any)?.process?.env?.MASTER_ENV ||
      (globalThis as any)?.process?.env?.NODE_ENV ||
      'development') as string
    const normalized = env.toLowerCase()
    if (normalized === 'prod') return 'production'
    if (normalized === 'stage' || normalized === 'staging') return 'staging'
    if (normalized === 'test') return 'test'
    return 'development'
  }

  static detectPlatform(): HostingConfig['platform'] {
    if (isNode()) return 'node'
    // Heuristic: in CF workers, 'WebSocketPair' and 'navigator' often exist
    // We default to workers if Node.js globals are absent
    return 'cloudflare-workers'
  }

  static getConfigPaths(baseDir = 'config'): { base?: string; env?: string; schema?: string } {
    const env = this.detectEnvironment()
    return {
      base: `${baseDir}/default.json`,
      env: `${baseDir}/${env}.json`,
      schema: `${baseDir}/schema.json`,
    }
  }

  static getExplicitConfigPath(): string | undefined {
    const fromEnv = (globalThis as any)?.process?.env?.MASTER_CONFIG_PATH
    const fromArg = isNode() ? EnvironmentManager.parseCliArgs().configPath : undefined
    return (fromArg as string | undefined) || (fromEnv as string | undefined)
  }

  static parseCliArgs(): { [k: string]: unknown; configPath?: string } {
    if (!isNode()) return {}
    const args = (process.argv || []).slice(2)
    const result: Record<string, unknown> = {}
    for (const a of args) {
      if (!a.startsWith('--')) continue
      const eq = a.indexOf('=')
      let key = a
      let val: unknown = true
      if (eq > -1) {
        key = a.slice(0, eq)
        const raw = a.slice(eq + 1)
        try {
          val = JSON.parse(raw)
        } catch {
          val = raw
        }
      }
      key = key.replace(/^--/, '')
      if (key === 'config' || key === 'config-path') {
        ;(result as any).configPath = String(val)
        continue
      }
      // Support dotted keys: --hosting.port=4000
      setByPath(result, key, val)
    }
    return result
  }

  static loadEnvOverrides(): Partial<MasterConfig> {
    // Map env vars to config fields. All are optional overrides.
    const env = (globalThis as any)?.process?.env ?? {}
    const hosting: Partial<HostingConfig> = {}
    if (env.MASTER_HOSTING_PLATFORM) hosting.platform = env.MASTER_HOSTING_PLATFORM as HostingConfig['platform']
    if (env.MASTER_HOSTING_PORT) hosting.port = Number(env.MASTER_HOSTING_PORT)
    if (env.MASTER_BASE_URL) hosting.base_url = String(env.MASTER_BASE_URL)

    const logging: Partial<NonNullable<MasterConfig['logging']>> = {}
    if (env.MASTER_LOG_LEVEL) logging.level = env.MASTER_LOG_LEVEL as any

    const master_oauth: Partial<MasterConfig['master_oauth']> = {}
    if (env.MASTER_OAUTH_ISSUER) master_oauth.issuer = String(env.MASTER_OAUTH_ISSUER)
    if (env.MASTER_OAUTH_AUTHORIZATION_ENDPOINT)
      master_oauth.authorization_endpoint = String(env.MASTER_OAUTH_AUTHORIZATION_ENDPOINT)
    if (env.MASTER_OAUTH_TOKEN_ENDPOINT) master_oauth.token_endpoint = String(env.MASTER_OAUTH_TOKEN_ENDPOINT)
    if (env.MASTER_OAUTH_JWKS_URI) master_oauth.jwks_uri = String(env.MASTER_OAUTH_JWKS_URI)
    if (env.MASTER_OAUTH_CLIENT_ID) master_oauth.client_id = String(env.MASTER_OAUTH_CLIENT_ID)
    if (env.MASTER_OAUTH_CLIENT_SECRET) master_oauth.client_secret = `env:MASTER_OAUTH_CLIENT_SECRET`
    if (env.MASTER_OAUTH_REDIRECT_URI) master_oauth.redirect_uri = String(env.MASTER_OAUTH_REDIRECT_URI)
    if (env.MASTER_OAUTH_SCOPES) master_oauth.scopes = String(env.MASTER_OAUTH_SCOPES)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (env.MASTER_OAUTH_AUDIENCE) master_oauth.audience = String(env.MASTER_OAUTH_AUDIENCE)

    // Servers can be provided as JSON in MASTER_SERVERS or YAML in MASTER_SERVERS_YAML
    let servers: MasterConfig['servers'] | undefined
    try {
      if (env.MASTER_SERVERS) servers = JSON.parse(String(env.MASTER_SERVERS))
    } catch (err) {
      Logger.warn('Failed to parse MASTER_SERVERS JSON; ignoring', String(err))
    }
    if (!servers && env.MASTER_SERVERS_YAML) {
      try {
        // External import avoided in workers; only parse if Node
        const YAML = isNode() ? (require('yaml') as typeof import('yaml')) : undefined
        if (YAML) servers = YAML.parse(String(env.MASTER_SERVERS_YAML))
      } catch (err) {
        Logger.warn('Failed to parse MASTER_SERVERS_YAML; ignoring', String(err))
      }
    }

    const override: Partial<MasterConfig> = {}
    if (Object.keys(hosting).length) (override as any).hosting = hosting
    if (Object.keys(logging).length) (override as any).logging = logging
    if (Object.keys(master_oauth).length) (override as any).master_oauth = master_oauth
    if (servers) (override as any).servers = servers
    return override
  }
}

function setByPath(target: Record<string, unknown>, dottedKey: string, value: unknown): void {
  const parts = dottedKey.split('.')
  let cur: any = target
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {}
    cur = cur[p]
  }
  cur[parts[parts.length - 1]] = value
}

