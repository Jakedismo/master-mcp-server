import type { MasterConfig, RoutingConfig, ServerConfig } from '../types/config.js'
import { ConfigLoader } from '../config/config-loader.js'
import { Logger } from '../utils/logger.js'
import { EnvironmentManager } from '../config/environment-manager.js'
import { SecretManager } from '../config/secret-manager.js'

export interface ConfigManagerOptions {
  // If provided, watch the file for changes (Node only)
  watch?: boolean
}

type Listener = (config: MasterConfig) => void

export class ConfigManager {
  private config: MasterConfig | null = null
  private readonly listeners: Set<Listener> = new Set()
  private stopWatcher?: () => void
  private readonly secrets = new SecretManager()
  private watchPaths: string[] = []

  constructor(private readonly options?: ConfigManagerOptions) {}

  async load(): Promise<MasterConfig> {
    const explicit = EnvironmentManager.getExplicitConfigPath()
    let loaded: MasterConfig
    try {
      loaded = await ConfigLoader.load({ path: explicit })
    } catch (err) {
      Logger.warn('Primary config load failed; attempting env-only load', String(err))
      loaded = await ConfigLoader.loadFromEnv()
    }
    const normalized = this.applyDefaults(loaded)
    this.config = normalized
    const redacted = this.secrets.redact(normalized)
    Logger.info('Configuration loaded', {
      servers: normalized.servers.length,
      hosting: normalized.hosting.platform,
      redacted,
    })
    if (this.options?.watch) this.prepareWatcher(explicit)
    return normalized
  }

  getConfig(): MasterConfig {
    if (!this.config) throw new Error('Config not loaded')
    return this.config
  }

  getRouting(): RoutingConfig | undefined {
    return this.config?.routing
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async reload(): Promise<void> {
    await this.load()
    if (this.config) this.emit(this.config)
  }

  stop(): void {
    try {
      this.stopWatcher?.()
    } catch {
      // ignore
    }
  }

  private emit(config: MasterConfig): void {
    for (const l of this.listeners) {
      try {
        l(config)
      } catch (err) {
        Logger.warn('Config listener threw', err)
      }
    }
  }

  private applyDefaults(cfg: MasterConfig): MasterConfig {
    // Shallow copy to avoid mutation
    const copy: MasterConfig = {
      ...cfg,
      hosting: {
        platform: cfg.hosting.platform ?? 'node',
        port: cfg.hosting.port ?? 3000,
        base_url: cfg.hosting.base_url,
      },
      routing: cfg.routing ? { ...cfg.routing } : {},
      master_oauth: { ...cfg.master_oauth },
      servers: cfg.servers.map((s) => this.normalizeServer(s)),
    }
    return copy
  }

  private normalizeServer(s: ServerConfig): ServerConfig {
    const port = s.config?.port
    const normalized: ServerConfig = {
      ...s,
      config: {
        environment: s.config?.environment ?? {},
        args: s.config?.args ?? [],
        ...(port ? { port } : {}),
      },
    }
    return normalized
  }

  private prepareWatcher(explicitPath?: string): void {
    const isNode = Boolean((globalThis as any)?.process?.versions?.node)
    if (!isNode) return
    const { base, env } = EnvironmentManager.getConfigPaths('config')
    this.watchPaths = []
    if (explicitPath) this.watchPaths.push(explicitPath)
    if (base) this.watchPaths.push(base)
    if (env) this.watchPaths.push(env)
    this.startWatcher()
  }

  private startWatcher(): void {
    const isNode = Boolean((globalThis as any)?.process?.versions?.node)
    if (!isNode || this.watchPaths.length === 0) return
    import('node:fs').then((fs) => {
      const watchers: any[] = []
      const onChange = async () => {
        try {
          Logger.info('Config change detected; validating and reloading...')
          const prev = this.config
          const newCfg = await ConfigLoader.load({ path: EnvironmentManager.getExplicitConfigPath() })
          const applied = this.applyDefaults(newCfg)
          if (prev) this.auditDiff(prev, applied)
          this.config = applied
          this.emit(this.config)
        } catch (err) {
          Logger.warn('Hot-reload failed to apply new config', String(err))
        }
      }
      for (const p of this.watchPaths) {
        try {
          watchers.push((fs as any).watch(p, { persistent: false }, onChange))
        } catch (err) {
          Logger.warn(`Failed to watch ${p}`, String(err))
        }
      }
      this.stopWatcher = () => {
        for (const w of watchers) {
          try {
            w?.close?.()
          } catch {
            // ignore
          }
        }
      }
    }).catch((err) => Logger.warn('Failed to start config file watcher', String(err)))
  }

  private auditDiff(oldCfg: MasterConfig, newCfg: MasterConfig): void {
    const diff: Record<string, { from: unknown; to: unknown }> = {}
    const keys = new Set([...Object.keys(oldCfg), ...Object.keys(newCfg)])
    for (const k of keys) {
      const a: any = (oldCfg as any)[k]
      const b: any = (newCfg as any)[k]
      if (JSON.stringify(a) !== JSON.stringify(b)) diff[k] = { from: a, to: b }
    }
    const redacted = this.secrets.redact(diff)
    // Highlight non-hot-reloadable settings
    if (oldCfg.hosting?.port !== newCfg.hosting?.port) {
      Logger.warn('Hosting port changed; restart required to apply')
    }
    Logger.info('Config change audit', redacted)
  }
}
