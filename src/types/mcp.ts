// Minimal MCP-like types for Phase 1 compilation.
// Replace with @modelcontextprotocol/sdk imports in later phases.

export interface ToolDefinition {
  name: string
  description?: string
  inputSchema?: unknown
}

export interface ResourceDefinition {
  uri: string
  name?: string
  description?: string
  mimeType?: string
}

export interface PromptDefinition {
  name: string
  description?: string
  input?: unknown
}

export interface ListToolsRequest {
  type: 'list_tools'
}

export interface ListToolsResult {
  tools: ToolDefinition[]
}

export interface CallToolRequest {
  name: string
  arguments?: Record<string, unknown> | undefined
}

export interface CallToolResult {
  content: unknown
  isError?: boolean
}

export interface ListResourcesRequest {
  type: 'list_resources'
}

export interface ListResourcesResult {
  resources: ResourceDefinition[]
}

export interface ReadResourceRequest {
  uri: string
}

export interface ReadResourceResult {
  contents: string | Uint8Array
  mimeType?: string
}

export interface SubscribeRequest {
  target: string
}

export interface SubscribeResult {
  ok: boolean
}

