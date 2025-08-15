import type { ToolDefinition, ResourceDefinition } from '../../src/types/mcp.js'

export function makeTools(...names: string[]): ToolDefinition[] {
  return names.map((n) => ({ name: n, description: `${n} tool` }))
}

export function makeResources(...uris: string[]): ResourceDefinition[] {
  return uris.map((u) => ({ uri: u, name: u, mimeType: 'text/plain' }))
}

