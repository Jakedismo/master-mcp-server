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
import type { CapabilityAggregator } from '../modules/capability-aggregator.js'
import type { RequestRouter } from '../modules/request-router.js'
import { Logger } from '../utils/logger.js'

export interface ProtocolContext {
  aggregator: CapabilityAggregator
  router: RequestRouter
  // Optional client bearer token provided by gateway
  getClientToken?: () => string | undefined
}

export class ProtocolHandler {
  constructor(private readonly ctx: ProtocolContext) {}

  async handleListTools(_req: ListToolsRequest): Promise<ListToolsResult> {
    try {
      const tools = this.ctx.aggregator.getAllTools(this.ctx.router.getServers())
      return { tools }
    } catch (err) {
      Logger.error('handleListTools failed', err)
      return { tools: [] }
    }
  }

  async handleCallTool(req: CallToolRequest): Promise<CallToolResult> {
    try {
      const token = this.ctx.getClientToken?.()
      const res = await this.ctx.router.routeCallTool(req, token)
      return res
    } catch (err) {
      Logger.warn('handleCallTool error', err)
      return { content: { error: String(err) }, isError: true }
    }
  }

  async handleListResources(_req: ListResourcesRequest): Promise<ListResourcesResult> {
    try {
      const resources = this.ctx.aggregator.getAllResources(this.ctx.router.getServers())
      return { resources }
    } catch (err) {
      Logger.error('handleListResources failed', err)
      return { resources: [] }
    }
  }

  async handleReadResource(req: ReadResourceRequest): Promise<ReadResourceResult> {
    try {
      const token = this.ctx.getClientToken?.()
      const res = await this.ctx.router.routeReadResource(req, token)
      return res
    } catch (err) {
      Logger.warn('handleReadResource error', err)
      return { contents: String(err), mimeType: 'text/plain' }
    }
  }

  async handleSubscribe(_req: SubscribeRequest): Promise<SubscribeResult> {
    // Event subscriptions not yet surfaced; return OK for MCP compatibility
    return { ok: true }
  }
}
