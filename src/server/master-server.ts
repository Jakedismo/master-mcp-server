// Phase 1: avoid hard dependency on SDK types to ensure compilation
import type { ServerCapabilities, LoadedServer } from '../types/server.js'
import type { MasterConfig, RoutingConfig, ServerConfig } from '../types/config.js'
import type { AuthHeaders, OAuthDelegation } from '../types/auth.js'
import { ProtocolHandler } from './protocol-handler.js'
import { DefaultModuleLoader } from '../modules/module-loader.js'
import { CapabilityAggregator } from '../modules/capability-aggregator.js'
import { RequestRouter } from '../modules/request-router.js'
import { Logger } from '../utils/logger.js'
import { MultiAuthManager } from '../auth/multi-auth-manager.js'
import { OAuthFlowController } from '../oauth/flow-controller.js'

export class MasterServer {
  readonly server: unknown
  readonly handler: ProtocolHandler

  private readonly loader = new DefaultModuleLoader()
  private readonly aggregator = new CapabilityAggregator()
  private readonly servers = new Map<string, LoadedServer>()
  private router!: RequestRouter
  private config?: MasterConfig
  private authManager?: MultiAuthManager
  private oauthController?: OAuthFlowController
  private getAuthHeaders: (
    serverId: string,
    clientToken?: string
  ) => Promise<AuthHeaders | OAuthDelegation | undefined>

  constructor(capabilities?: Partial<ServerCapabilities>, routing?: RoutingConfig) {
    const version = (globalThis as any)?.process?.env?.APP_VERSION ?? '0.1.0'
    this.server = { name: 'master-mcp-server', version }
    this.getAuthHeaders = async (_serverId: string, clientToken?: string) =>
      clientToken ? { Authorization: `Bearer ${clientToken}` } : undefined
    this.router = new RequestRouter(this.servers, this.aggregator, this.getAuthHeaders.bind(this), { routing })
    this.handler = new ProtocolHandler({ aggregator: this.aggregator, router: this.router })
    void capabilities
  }

  async startFromConfig(config: MasterConfig, clientToken?: string): Promise<void> {
    Logger.info('Starting MasterServer from config')
    this.config = config
    await this.loadServers(config.servers, clientToken)
    await this.discoverAllCapabilities(clientToken)
  }

  async loadServers(servers: ServerConfig[], clientToken?: string): Promise<void> {
    const loaded = await this.loader.loadServers(servers, clientToken)
    this.servers.clear()
    for (const [id, s] of loaded) this.servers.set(id, s)
    this.router = new RequestRouter(this.servers, this.aggregator, this.getAuthHeaders.bind(this), {
      routing: this.config?.routing,
    })
    ;(this as any).handler = new ProtocolHandler({ aggregator: this.aggregator, router: this.router })
  }

  async discoverAllCapabilities(clientToken?: string): Promise<void> {
    const headersOnly = async (serverId: string, token?: string) => {
      const res = await this.getAuthHeaders(serverId, token)
      if (res && (res as OAuthDelegation).type === 'oauth_delegation') {
        return token ? { Authorization: `Bearer ${token}` } : undefined
      }
      return res as AuthHeaders | undefined
    }
    await this.aggregator.discoverCapabilities(this.servers, clientToken, headersOnly)
  }

  // Allow host app to inject an auth header strategy (e.g., MultiAuthManager)
  setAuthHeaderProvider(
    fn: (serverId: string, clientToken?: string) => Promise<AuthHeaders | OAuthDelegation | undefined>
  ): void {
    this.getAuthHeaders = fn
    this.router = new RequestRouter(this.servers, this.aggregator, this.getAuthHeaders.bind(this), {
      routing: this.config?.routing,
    })
    ;(this as any).handler = new ProtocolHandler({ aggregator: this.aggregator, router: this.router })
  }

  getRouter(): RequestRouter {
    return this.router
  }

  getAggregatedTools(): ServerCapabilities['tools'] {
    return this.aggregator.getAllTools(this.servers)
  }

  getAggregatedResources(): ServerCapabilities['resources'] {
    return this.aggregator.getAllResources(this.servers)
  }

  async performHealthChecks(clientToken?: string): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {}
    for (const [id, s] of this.servers) {
      results[id] = await this.loader.performHealthCheck(s, clientToken)
    }
    return results
  }

  async restartServer(id: string): Promise<void> {
    await this.loader.restartServer(id)
  }

  async unloadAll(): Promise<void> {
    await Promise.all(Array.from(this.servers.keys()).map((id) => this.loader.unload(id)))
    this.servers.clear()
  }

  attachAuthManager(manager: MultiAuthManager): void {
    this.authManager = manager
    this.setAuthHeaderProvider((serverId: string, clientToken?: string) => {
      if (!clientToken) return Promise.resolve(undefined)
      return this.authManager!.prepareAuthForBackend(serverId, clientToken)
    })
  }

  // Provide an OAuthFlowController wired to the current config and auth manager.
  // Host runtimes (Node/Workers) can use this to mount HTTP endpoints without coupling MasterServer to a specific HTTP framework.
  getOAuthFlowController(): OAuthFlowController {
    if (!this.config) throw new Error('MasterServer config not initialized')
    if (!this.authManager) throw new Error('Auth manager not attached')
    if (!this.oauthController) {
      this.oauthController = new OAuthFlowController(
        {
          getConfig: () => this.config!,
          storeDelegatedToken: async (clientToken, serverId, token) => {
            await this.authManager!.storeDelegatedToken(clientToken, serverId, token)
          },
        },
        '/oauth'
      )
    }
    return this.oauthController
  }

  updateRouting(routing?: RoutingConfig): void {
    this.router = new RequestRouter(this.servers, this.aggregator, this.getAuthHeaders.bind(this), { routing })
    ;(this as any).handler = new ProtocolHandler({ aggregator: this.aggregator, router: this.router })
  }
}
