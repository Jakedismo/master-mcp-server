import type { ToolDefinition, ResourceDefinition, PromptDefinition } from './mcp.js'
import type { ServerConfig } from './config.js'

export type ServerType = 'python' | 'node' | 'typescript' | 'stdio' | 'unknown'

export interface ServerProcess {
  pid?: number
  port?: number
  url?: string
  stop: () => Promise<void>
}

export interface ServerCapabilities {
  tools: ToolDefinition[]
  resources: ResourceDefinition[]
  prompts?: PromptDefinition[]
}

export interface LoadedServer {
  id: string
  type: ServerType
  process?: ServerProcess
  endpoint: string
  config: ServerConfig
  capabilities?: ServerCapabilities
  status: 'starting' | 'running' | 'stopped' | 'error'
  lastHealthCheck: number
  // Optional: when a server has multiple deploys/instances
  instances?: ServerInstance[]
}

export interface ServerInstance {
  id: string
  url: string
  weight?: number
  healthScore?: number // 0..100, used by health-based LB
}
