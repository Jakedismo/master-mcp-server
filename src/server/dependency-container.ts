import { ConfigManager } from './config-manager.js'
import { DefaultModuleLoader } from '../modules/module-loader.js'
import { CapabilityAggregator } from '../modules/capability-aggregator.js'
import { RequestRouter } from '../modules/request-router.js'
import { ProtocolHandler } from './protocol-handler.js'
import { MasterServer } from './master-server.js'
import { MultiAuthManager } from '../auth/multi-auth-manager.js'
import type { MasterConfig, ServerConfig } from '../types/config.js'
import { Logger } from '../utils/logger.js'

export class DependencyContainer {
  readonly configManager: ConfigManager
  readonly loader: DefaultModuleLoader
  readonly aggregator: CapabilityAggregator
  readonly master: MasterServer
  readonly authManager: MultiAuthManager
  readonly router: RequestRouter
  readonly handler: ProtocolHandler

  private config!: MasterConfig

  constructor() {
    this.configManager = new ConfigManager({ watch: true })
    this.loader = new DefaultModuleLoader()
    this.aggregator = new CapabilityAggregator()
    // Create a temporary router for early wiring; will be replaced after config load
    this.router = new RequestRouter(new Map(), this.aggregator)
    this.master = new MasterServer(undefined, undefined)
    // Temporarily construct auth manager with placeholder; will be replaced after config
    this.authManager = new MultiAuthManager({
      authorization_endpoint: 'about:blank',
      token_endpoint: 'about:blank',
      client_id: 'placeholder',
      redirect_uri: 'about:blank',
      scopes: ['openid'],
    })
    this.handler = this.master.handler
  }

  async initialize(clientToken?: string): Promise<void> {
    this.config = await this.configManager.load()
    // Recreate auth manager with real config
    const auth = new MultiAuthManager(this.config.master_oauth)
    this.registerServerAuth(auth, this.config.servers)
    this.master.attachAuthManager(auth)
    ;(this as any).authManager = auth

    // Load servers and discover capabilities
    await this.master.startFromConfig(this.config, clientToken)
    this.master.updateRouting(this.config.routing)

    // Recreate router/handler references for easy access
    ;(this as any).router = this.master.getRouter()
    ;(this as any).handler = this.master.handler

    // Watch for config changes and hot-reload
    this.configManager.onChange(async (cfg) => {
      try {
        Logger.info('Applying updated configuration to MasterServer')
        this.config = cfg
        this.registerServerAuth(this.authManager, cfg.servers)
        await this.master.loadServers(cfg.servers)
        await this.master.discoverAllCapabilities()
        this.master.updateRouting(cfg.routing)
      } catch (err) {
        Logger.warn('Failed to apply updated config', err)
      }
    })
  }

  getConfig(): MasterConfig {
    return this.config
  }

  private registerServerAuth(manager: MultiAuthManager, servers: ServerConfig[]): void {
    for (const s of servers) {
      try {
        manager.registerServerAuth(s.id, s.auth_strategy, s.auth_config)
      } catch (err) {
        Logger.warn(`Failed to register auth for server ${s.id}`, err)
      }
    }
  }
}

