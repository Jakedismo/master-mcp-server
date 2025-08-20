import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Request, Response } from 'express'
import { Logger } from './utils/logger.js'
import { DependencyContainer } from './server/dependency-container.js'
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

// Create an MCP server with the official SDK
export async function createMcpServer(container: DependencyContainer): Promise<{
  mcpServer: McpServer,
  transport: StreamableHTTPServerTransport,
  handleRequest: (req: Request, res: Response) => Promise<void>
}> {
  // Create the MCP server with server info
  const mcpServer = new McpServer({
    name: 'master-mcp-server',
    version: '0.1.0'
  }, {
    capabilities: {
      tools: { listChanged: true },
      resources: { listChanged: true },
      prompts: { listChanged: true }
    }
  })

  // Register tools from the aggregated servers BEFORE connecting to transport
  const aggregatedTools = container.master.getAggregatedTools()
  Logger.info('Aggregated tools', { count: aggregatedTools.length, tools: aggregatedTools.map(t => t.name) })
  for (const tool of aggregatedTools) {
    // Skip tools with names that might cause conflicts
    if (tool.name.includes('..')) continue;
    
    Logger.info('Registering tool', { name: tool.name, description: tool.description })
    // Register the tool with the MCP server
    mcpServer.tool(tool.name, tool.description ?? '', async (args) => {
      try {
        // Route the tool call to the appropriate backend server
        const result = await container.master.handler.handleCallTool({
          name: tool.name,
          arguments: args
        })
        return result as CallToolResult
      } catch (error) {
        Logger.error('Tool execution failed', { tool: tool.name, error })
        return {
          content: [{
            type: 'text',
            text: `Error executing tool ${tool.name}: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        }
      }
    })
  }

  // Register resources from the aggregated servers BEFORE connecting to transport
  const aggregatedResources = container.master.getAggregatedResources()
  Logger.info('Aggregated resources', { count: aggregatedResources.length, resources: aggregatedResources.map(r => r.uri) })
  for (const resource of aggregatedResources) {
    // Skip resources with URIs that might cause conflicts
    if (resource.uri.includes('..')) continue;
    
    Logger.info('Registering resource', { name: resource.name, uri: resource.uri, description: resource.description })
    mcpServer.resource(
      resource.name ?? resource.uri,
      resource.uri,
      {
        description: resource.description,
        mimeType: resource.mimeType
      },
      async () => {
        try {
          // Route the resource read to the appropriate backend server
          const result = await container.master.handler.handleReadResource({
            uri: resource.uri
          })
          
          // Convert the result to the format expected by the MCP server
          if (typeof result.contents === 'string') {
            return {
              contents: [{
                uri: resource.uri,
                text: result.contents,
                mimeType: result.mimeType
              }]
            }
          } else {
            return {
              contents: [{
                uri: resource.uri,
                blob: Buffer.from(result.contents).toString('base64'),
                mimeType: result.mimeType
              }]
            }
          }
        } catch (error) {
          Logger.error('Resource read failed', { resource: resource.uri, error })
          throw new Error(`Error reading resource ${resource.uri}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    )
  }

  // Create the HTTP streaming transport in stateless mode
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode
    enableJsonResponse: false, // Use SSE by default
    enableDnsRebindingProtection: false
  })

  // Connect the server to the transport AFTER registering tools and resources
  await mcpServer.connect(transport)

  // Create a handler function for Express
  const handleRequest = async (req: Request, res: Response) => {
    try {
      await transport.handleRequest(req, res, req.body)
    } catch (error) {
      Logger.error('MCP request handling failed', { error })
      res.status(500).json({
        error: 'Internal server error'
      })
    }
  }

  return { mcpServer, transport, handleRequest }
}