import type { LoadedServer, ServerProcess, ServerType } from '../types/server.js'
import type { ServerConfig } from '../types/config.js'
import type { AuthHeaders } from '../types/auth.js'
import { Logger } from '../utils/logger.js'

export interface ModuleLoaderOptions {
  healthEndpoint?: string // path appended to endpoint, defaults to '/health'
  capabilitiesEndpoint?: string // path appended to endpoint, defaults to '/capabilities'
  defaultHostname?: string // defaults to 'localhost'
}

export interface ModuleLoader {
  loadServers(configs: ServerConfig[], clientToken?: string): Promise<Map<string, LoadedServer>>
  load(config: ServerConfig, clientToken?: string): Promise<LoadedServer>
  unload(id: string): Promise<void>
  performHealthCheck(server: LoadedServer, clientToken?: string): Promise<boolean>
  restartServer(serverId: string): Promise<void>
}

/**
 * DefaultModuleLoader implements multi-source loading with cross-platform process placeholders.
 * It avoids Node-specific APIs so it can compile for both Node and Workers builds.
 * Actual spawning should be implemented by a platform-specific adapter in later phases.
 */
export class DefaultModuleLoader implements ModuleLoader {
  private servers = new Map<string, LoadedServer>()
  private options: Required<ModuleLoaderOptions>

  constructor(options?: ModuleLoaderOptions) {
    this.options = {
      healthEndpoint: options?.healthEndpoint ?? '/health',
      capabilitiesEndpoint: options?.capabilitiesEndpoint ?? '/capabilities',
      defaultHostname: options?.defaultHostname ?? 'localhost',
    }
  }

  async loadServers(configs: ServerConfig[], clientToken?: string): Promise<Map<string, LoadedServer>> {
    const results = await Promise.all(
      configs.map(async (cfg) => {
        try {
          const server = await this.load(cfg, clientToken)
          return [cfg.id, server] as const
        } catch (err) {
          Logger.error(`Failed to load server ${cfg.id}`, err)
          const server: LoadedServer = {
            id: cfg.id,
            type: 'unknown',
            endpoint: 'unknown',
            config: cfg,
            status: 'error',
            lastHealthCheck: Date.now(),
          }
          return [cfg.id, server] as const
        }
      })
    )
    for (const [id, s] of results) this.servers.set(id, s)
    return new Map(this.servers)
  }

  async load(config: ServerConfig, clientToken?: string): Promise<LoadedServer> {
    const type = this.detectServerType(config)
    const base: LoadedServer = {
      id: config.id,
      type,
      endpoint: this.deriveEndpoint(config),
      config,
      status: 'starting',
      lastHealthCheck: 0,
    }

    let loaded: LoadedServer
    switch (config.type) {
      case 'git':
        loaded = await this.loadFromGit(config, base)
        break
      case 'npm':
        loaded = await this.loadFromNpm(config, base)
        break
      case 'pypi':
        loaded = await this.loadFromPypi(config, base)
        break
      case 'docker':
        loaded = await this.loadFromDocker(config, base)
        break
      case 'local':
        loaded = await this.loadFromLocal(config, base)
        break
      default:
        loaded = base
    }

    // Immediate health check to set running/error
    try {
      const ok = await this.performHealthCheck(loaded, clientToken)
      loaded.status = ok ? 'running' : 'error'
    } catch (err) {
      Logger.warn(`Health check failed for ${config.id}`, err)
      loaded.status = 'error'
    }

    this.servers.set(loaded.id, loaded)
    return loaded
  }

  async unload(id: string): Promise<void> {
    const server = this.servers.get(id)
    if (!server) return
    try {
      await server.process?.stop()
    } catch (err) {
      Logger.warn(`Error stopping server ${id}`, err)
    } finally {
      this.servers.delete(id)
      Logger.logServerEvent('unloaded', id)
    }
  }

  async restartServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId)
    if (!server) throw new Error(`Server not found: ${serverId}`)
    Logger.logServerEvent('restarting', serverId)
    try {
      await server.process?.stop()
    } catch (err) {
      Logger.warn(`Error stopping server ${serverId} during restart`, err)
    }
    // Re-load using the same config
    const reloaded = await this.load(server.config)
    this.servers.set(serverId, reloaded)
  }

  async performHealthCheck(server: LoadedServer, clientToken?: string): Promise<boolean> {
    if (!server.endpoint || server.endpoint === 'unknown') {
      server.lastHealthCheck = Date.now()
      server.status = 'error'
      return false
    }
    const url = new URL(this.options.healthEndpoint, this.ensureTrailingSlash(server.endpoint)).toString()
    const headers: AuthHeaders = {}
    // In Phase 3, auth integration is handled at higher layers; here we only accept a caller-provided token.
    if (clientToken) headers['Authorization'] = `Bearer ${clientToken}`
    try {
      const res = await fetch(url, { headers })
      server.lastHealthCheck = Date.now()
      if (!res.ok) return false
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('application/json')) {
        const json = (await res.json()) as any
        return Boolean(json?.ok ?? true)
      }
      return true
    } catch (err) {
      server.lastHealthCheck = Date.now()
      Logger.warn(`Health check request failed for ${server.id}`, err)
      return false
    }
  }

  // --- Multi-source loading stubs (network/process performed outside this module in later phases) ---
  private async loadFromGit(config: ServerConfig, base: LoadedServer): Promise<LoadedServer> {
    // In a full implementation, we'd clone and install. Here we assume it's pre-built and start it.
    Logger.logServerEvent('loadFromGit', config.id, { url: config.url, branch: config.branch })
    return this.startRuntime(config, base)
  }

  private async loadFromNpm(config: ServerConfig, base: LoadedServer): Promise<LoadedServer> {
    Logger.logServerEvent('loadFromNpm', config.id, { pkg: config.package, version: config.version })
    return this.startRuntime(config, base)
  }

  private async loadFromPypi(config: ServerConfig, base: LoadedServer): Promise<LoadedServer> {
    Logger.logServerEvent('loadFromPypi', config.id, { pkg: config.package, version: config.version })
    return this.startRuntime(config, base)
  }

  private async loadFromDocker(config: ServerConfig, base: LoadedServer): Promise<LoadedServer> {
    Logger.logServerEvent('loadFromDocker', config.id, { image: config.package, tag: config.version })
    // Docker orchestration would run the container exposing a port; we only resolve endpoint here
    return { ...base, status: 'starting' }
  }

  private async loadFromLocal(config: ServerConfig, base: LoadedServer): Promise<LoadedServer> {
    Logger.logServerEvent('loadFromLocal', config.id, { path: config.url })
    return this.startRuntime(config, base)
  }

  // --- Runtime orchestration and type detection ---
  private detectServerType(config: ServerConfig): ServerType {
    // Heuristics: look at package name/url/args for hints
    const name = (config.package ?? config.url ?? '').toLowerCase()
    if (name.endsWith('.py') || /py|pypi|python/.test(name)) return 'python'
    if (/ts|typescript/.test(name)) return 'typescript'
    if (/node|js|npm/.test(name)) return 'node'
    return 'unknown'
  }

  private deriveEndpoint(config: ServerConfig): string {
    const port = config.config.port
    if (port) return `http://${this.options.defaultHostname}:${port}`
    // If URL looks like http(s):// use as-is
    const url = config.url ?? ''
    if (/^https?:\/\//i.test(url)) return url
    return 'unknown'
  }

  private async startRuntime(config: ServerConfig, base: LoadedServer): Promise<LoadedServer> {
    const type = this.detectServerType(config)
    let proc: ServerProcess | undefined
    try {
      if (type === 'python') {
        proc = await this.startPythonServer(config)
      } else if (type === 'typescript' || type === 'node') {
        proc = await this.startTypeScriptServer(config)
      } else {
        // Unknown: assume externally managed endpoint
        proc = undefined
      }
    } catch (err) {
      Logger.error(`Failed to start runtime for ${config.id}`, err)
      return { ...base, status: 'error' }
    }
    return { ...base, process: proc, status: 'starting' }
  }

  // Cross-platform placeholders. Real implementation should manage child processes per-OS.
  private async startPythonServer(_config: ServerConfig): Promise<ServerProcess> {
    // Placeholder: assume an external process is started via orchestrator. Provide a no-op stop.
    return { stop: async () => void 0 }
  }

  private async startTypeScriptServer(_config: ServerConfig): Promise<ServerProcess> {
    // Placeholder: assume an external process is started via orchestrator. Provide a no-op stop.
    return { stop: async () => void 0 }
  }

  private ensureTrailingSlash(endpoint: string): string {
    if (!endpoint.endsWith('/')) return `${endpoint}/`
    return endpoint
  }
}
