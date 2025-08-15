import type { LoadedServer, ServerCapabilities } from '../types/server.js'
import type { ListResourcesResult, ListToolsResult, ToolDefinition, ResourceDefinition, PromptDefinition } from '../types/mcp.js'
import type { AuthHeaders } from '../types/auth.js'
import { Logger } from '../utils/logger.js'

export interface AggregatorOptions {
  prefixStrategy?: 'serverId' | 'none'
  // base path for discovery relative to server endpoint
  capabilitiesEndpoint?: string // default '/capabilities'
  toolsEndpoint?: string // default '/mcp/tools/list'
  resourcesEndpoint?: string // default '/mcp/resources/list'
}

export interface CapabilityMapEntry {
  serverId: string
  originalName: string
}

export class CapabilityAggregator {
  private readonly options: Required<AggregatorOptions>
  private toolMap = new Map<string, CapabilityMapEntry>()
  private resourceMap = new Map<string, CapabilityMapEntry>()

  constructor(options?: AggregatorOptions) {
    this.options = {
      prefixStrategy: options?.prefixStrategy ?? 'serverId',
      capabilitiesEndpoint: options?.capabilitiesEndpoint ?? '/capabilities',
      toolsEndpoint: options?.toolsEndpoint ?? '/mcp/tools/list',
      resourcesEndpoint: options?.resourcesEndpoint ?? '/mcp/resources/list',
    }
  }

  reset(): void {
    this.toolMap.clear()
    this.resourceMap.clear()
  }

  getMappingForTool(aggregatedName: string): CapabilityMapEntry | undefined {
    return this.toolMap.get(aggregatedName)
  }

  getMappingForResource(aggregatedUri: string): CapabilityMapEntry | undefined {
    return this.resourceMap.get(aggregatedUri)
  }

  async discoverCapabilities(
    servers: Map<string, LoadedServer>,
    clientToken?: string,
    getAuthHeaders?: (serverId: string, clientToken?: string) => Promise<AuthHeaders | undefined>
  ): Promise<void> {
    this.reset()
    const fallbackHeaders: AuthHeaders = {}
    if (clientToken) fallbackHeaders['Authorization'] = `Bearer ${clientToken}`

    await Promise.all(
      Array.from(servers.values()).map(async (server) => {
        if (!server.endpoint || server.endpoint === 'unknown') return
        try {
          const headers = (await getAuthHeaders?.(server.id, clientToken)) ?? fallbackHeaders
          const caps = await this.fetchCapabilities(server.endpoint, headers)
          server.capabilities = caps
          this.index(server.id, caps)
          Logger.logServerEvent('capabilities_discovered', server.id, {
            tools: caps.tools.length,
            resources: caps.resources.length,
            prompts: caps.prompts?.length ?? 0,
          })
        } catch (err) {
          Logger.warn(`Failed capability discovery for ${server.id}`, err)
        }
      })
    )
  }

  getAllTools(servers: Map<string, LoadedServer>): ToolDefinition[] {
    const result: ToolDefinition[] = []
    for (const server of servers.values()) {
      const tools = server.capabilities?.tools ?? []
      for (const t of tools) {
        const name = this.aggregateName(server.id, t.name)
        result.push({ ...t, name })
      }
    }
    return result
  }

  getAllResources(servers: Map<string, LoadedServer>): ResourceDefinition[] {
    const result: ResourceDefinition[] = []
    for (const server of servers.values()) {
      const resources = server.capabilities?.resources ?? []
      for (const r of resources) {
        const uri = this.aggregateName(server.id, r.uri)
        result.push({ ...r, uri })
      }
    }
    return result
  }

  aggregate(servers: LoadedServer[]): ServerCapabilities {
    const tools = servers.flatMap((s) => (s.capabilities?.tools ?? []).map((t) => ({ ...t, name: this.aggregateName(s.id, t.name) })))
    const resources = servers.flatMap((s) => (s.capabilities?.resources ?? []).map((r) => ({ ...r, uri: this.aggregateName(s.id, r.uri) })))
    const prompts = servers.flatMap((s) => s.capabilities?.prompts ?? [])
    return { tools, resources, prompts: prompts.length ? prompts : undefined }
  }

  // --- internals ---
  private index(serverId: string, caps: ServerCapabilities): void {
    for (const t of caps.tools) this.toolMap.set(this.aggregateName(serverId, t.name), { serverId, originalName: t.name })
    for (const r of caps.resources) this.resourceMap.set(this.aggregateName(serverId, r.uri), { serverId, originalName: r.uri })
  }

  private aggregateName(serverId: string, name: string): string {
    if (this.options.prefixStrategy === 'none') return name
    return `${serverId}.${name}`
  }

  private ensureTrailingSlash(endpoint: string): string {
    return endpoint.endsWith('/') ? endpoint : `${endpoint}/`
  }

  private async fetchCapabilities(endpoint: string, headers: AuthHeaders): Promise<ServerCapabilities> {
    const urlCap = new URL(this.options.capabilitiesEndpoint, this.ensureTrailingSlash(endpoint)).toString()
    try {
      const res = await fetch(urlCap, { headers })
      if (res.ok) {
        const json = (await res.json()) as any
        // Try to coerce shapes
        const tools: ToolDefinition[] = Array.isArray(json.tools) ? json.tools : (json.capabilities?.tools ?? [])
        const resources: ResourceDefinition[] = Array.isArray(json.resources) ? json.resources : (json.capabilities?.resources ?? [])
        const prompts: PromptDefinition[] | undefined = Array.isArray(json.prompts) ? json.prompts : (json.capabilities?.prompts ?? undefined)
        return { tools, resources, prompts }
      }
    } catch (err) {
      Logger.debug('Direct capabilities endpoint failed, trying fallbacks', err)
    }

    // Fallback: fetch tools and resources separately
    const [tools, resources] = await Promise.all([this.fetchTools(endpoint, headers), this.fetchResources(endpoint, headers)])
    return { tools, resources }
  }

  private async fetchTools(endpoint: string, headers: AuthHeaders): Promise<ToolDefinition[]> {
    const url = new URL(this.options.toolsEndpoint, this.ensureTrailingSlash(endpoint)).toString()
    try {
      const res = await fetch(url, { headers })
      if (res.ok) {
        const json = (await res.json()) as ListToolsResult
        return json.tools ?? []
      }
    } catch (err) {
      Logger.warn('fetchTools failed', err)
    }
    return []
  }

  private async fetchResources(endpoint: string, headers: AuthHeaders): Promise<ResourceDefinition[]> {
    const url = new URL(this.options.resourcesEndpoint, this.ensureTrailingSlash(endpoint)).toString()
    try {
      const res = await fetch(url, { headers })
      if (res.ok) {
        const json = (await res.json()) as ListResourcesResult
        return json.resources ?? []
      }
    } catch (err) {
      Logger.warn('fetchResources failed', err)
    }
    return []
  }
}
