import type {
  CallToolRequest,
  CallToolResult,
  ListResourcesRequest,
  ListResourcesResult,
  ListToolsRequest,
  ListToolsResult,
  ReadResourceRequest,
  ReadResourceResult,
  SubscribeRequest,
  SubscribeResult,
} from '../types/mcp.js'
import type { LoadedServer } from '../types/server.js'
import type { AuthHeaders, OAuthDelegation } from '../types/auth.js'
import { CapabilityAggregator } from './capability-aggregator.js'
import { Logger } from '../utils/logger.js'
import { CircuitBreaker } from '../routing/circuit-breaker.js'
import { LoadBalancer } from '../routing/load-balancer.js'
import { RouteRegistry } from '../routing/route-registry.js'
import { RetryHandler } from '../routing/retry-handler.js'
import type { RoutingConfig } from '../types/config.js'

export interface RouterOptions {
  callToolEndpoint?: string // default '/mcp/tools/call'
  readResourceEndpoint?: string // default '/mcp/resources/read'
  routing?: RoutingConfig
}

export class RequestRouter {
  private readonly options: Required<Omit<RouterOptions, 'routing'>> & { routing: RoutingConfig }
  private readonly circuit: CircuitBreaker
  private readonly retry: RetryHandler
  private readonly lb: LoadBalancer
  private readonly registry: RouteRegistry

  constructor(
    private readonly servers: Map<string, LoadedServer>,
    private readonly aggregator: CapabilityAggregator,
    private readonly getAuthHeaders?: (
      serverId: string,
      clientToken?: string
    ) => Promise<AuthHeaders | OAuthDelegation | undefined>,
    options?: RouterOptions
  ) {
    this.options = {
      callToolEndpoint: options?.callToolEndpoint ?? '/mcp/tools/call',
      readResourceEndpoint: options?.readResourceEndpoint ?? '/mcp/resources/read',
      routing: options?.routing ?? {},
    }
    this.circuit = new CircuitBreaker({
      failureThreshold: this.options.routing.circuitBreaker?.failureThreshold ?? 5,
      successThreshold: this.options.routing.circuitBreaker?.successThreshold ?? 2,
      recoveryTimeoutMs: this.options.routing.circuitBreaker?.recoveryTimeoutMs ?? 30_000,
      name: 'request-router',
    })
    this.retry = new RetryHandler({
      maxRetries: this.options.routing.retry?.maxRetries ?? 2,
      baseDelayMs: this.options.routing.retry?.baseDelayMs ?? 250,
      maxDelayMs: this.options.routing.retry?.maxDelayMs ?? 4_000,
      backoffFactor: this.options.routing.retry?.backoffFactor ?? 2,
      jitter: this.options.routing.retry?.jitter ?? 'full',
      retryOn: this.options.routing.retry?.retryOn ?? { networkErrors: true, httpStatusClasses: [5], httpStatuses: [408, 429] },
    })
    this.lb = new LoadBalancer({ strategy: this.options.routing.loadBalancer?.strategy ?? 'round_robin' })
    this.registry = new RouteRegistry(this.servers, this.circuit, this.lb)
  }

  getServers(): Map<string, LoadedServer> {
    return this.servers
  }

  async routeListTools(_req: ListToolsRequest): Promise<ListToolsResult> {
    const tools = this.aggregator.getAllTools(this.servers)
    return { tools }
  }

  async routeCallTool(req: CallToolRequest, clientToken?: string): Promise<CallToolResult> {
    // Resolve mapping via aggregator if available
    const map = this.aggregator.getMappingForTool(req.name)
    const serverId = map?.serverId ?? req.name.split('.')[0]
    const toolName = map?.originalName ?? (req.name.includes('.') ? req.name.split('.').slice(1).join('.') : req.name)

    const resolution = this.registry.resolve(serverId)
    if (!resolution) {
      return { content: { error: `Route not found for tool ${req.name}` }, isError: true }
    }

    const headers: AuthHeaders = { 'content-type': 'application/json' }
    const auth = await this.getAuthHeaders?.(serverId, clientToken)
    if (auth && (auth as OAuthDelegation).type === 'oauth_delegation') {
      return { content: { error: 'OAuth delegation required', details: auth }, isError: true }
    }
    const extra = (auth as AuthHeaders) ?? (clientToken ? { Authorization: `Bearer ${clientToken}` } : {})
    Object.assign(headers, extra)

    const url = new URL(this.options.callToolEndpoint, this.ensureTrailingSlash(resolution.instance.url)).toString()
    const key = `${serverId}::${resolution.instance.id}`

    try {
      const json = await this.circuit.execute(key, async () => {
        const res = await this.fetchWithRetry(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: toolName, arguments: req.arguments ?? {} }),
        })
        return (await res.json()) as CallToolResult
      })
      this.registry.markSuccess(serverId, resolution.instance.id)
      return json
    } catch (err) {
      this.registry.markFailure(serverId, resolution.instance.id)
      Logger.warn('routeCallTool failed', err)
      return { content: { error: String(err) }, isError: true }
    }
  }

  async routeListResources(_req: ListResourcesRequest): Promise<ListResourcesResult> {
    const resources = this.aggregator.getAllResources(this.servers)
    return { resources }
  }

  async routeReadResource(req: ReadResourceRequest, clientToken?: string): Promise<ReadResourceResult> {
    const map = this.aggregator.getMappingForResource(req.uri)
    const serverId = map?.serverId ?? req.uri.split('.')[0]
    const resourceUri = map?.originalName ?? (req.uri.includes('.') ? req.uri.split('.').slice(1).join('.') : req.uri)

    const resolution = this.registry.resolve(serverId)
    if (!resolution) {
      return { contents: `Route not found for resource ${req.uri}`, mimeType: 'text/plain' }
    }

    const headers: AuthHeaders = { 'content-type': 'application/json' }
    const auth = await this.getAuthHeaders?.(serverId, clientToken)
    if (auth && (auth as OAuthDelegation).type === 'oauth_delegation') {
      return { contents: JSON.stringify({ error: 'OAuth delegation required', details: auth }), mimeType: 'application/json' }
    }
    const extra = (auth as AuthHeaders) ?? (clientToken ? { Authorization: `Bearer ${clientToken}` } : {})
    Object.assign(headers, extra)

    const url = new URL(this.options.readResourceEndpoint, this.ensureTrailingSlash(resolution.instance.url)).toString()
    const key = `${serverId}::${resolution.instance.id}`
    try {
      const json = await this.circuit.execute(key, async () => {
        const res = await this.fetchWithRetry(url, { method: 'POST', headers, body: JSON.stringify({ uri: resourceUri }) })
        return (await res.json()) as ReadResourceResult
      })
      this.registry.markSuccess(serverId, resolution.instance.id)
      return json
    } catch (err) {
      this.registry.markFailure(serverId, resolution.instance.id)
      Logger.warn('routeReadResource failed', err)
      return { contents: String(err), mimeType: 'text/plain' }
    }
  }

  async routeSubscribe(_req: SubscribeRequest): Promise<SubscribeResult> {
    // Not implemented yet; aggregation events out of scope here
    return { ok: true }
  }

  private ensureTrailingSlash(endpoint: string): string {
    return endpoint.endsWith('/') ? endpoint : `${endpoint}/`
  }

  private async fetchWithRetry(input: string, init: RequestInit): Promise<Response> {
    return this.retry.execute(async () => {
      const res = await fetch(input, init)
      if (!res.ok) {
        // For retry logic, throw an error carrying status to trigger retry policy
        const err = new Error(`HTTP ${res.status}`) as Error & { status?: number }
        ;(err as any).status = res.status
        throw err
      }
      return res
    }, (ctx) => {
      Logger.debug('Retrying upstream request', ctx)
    })
  }
}
