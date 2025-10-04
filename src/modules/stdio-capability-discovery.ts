import { Logger } from '../utils/logger.js'
import type { ServerCapabilities } from '../types/server.js'
import { StdioManager } from './stdio-manager.js'

export class StdioCapabilityDiscovery {
  constructor(private stdioManager: StdioManager = new StdioManager()) {}

  async discoverCapabilities(serverId: string, filePath: string): Promise<ServerCapabilities> {
    Logger.info('Discovering capabilities for STDIO server', { serverId, filePath })
    
    try {
      // Start the STDIO server process
      await this.stdioManager.startServer(serverId, filePath)
      
      // Send initialize request
      const initializeRequestId = Date.now()
      const initializeRequest = {
        jsonrpc: "2.0",
        id: initializeRequestId,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { 
            name: "master-mcp-server",
            version: "1.0.0"
          }
        }
      }
      
      await this.stdioManager.sendMessage(serverId, initializeRequest)
      const initializeResponse = await this.stdioManager.waitForResponse(serverId, initializeRequestId)
      
      if (initializeResponse.error) {
        throw new Error(`Failed to initialize STDIO server: ${initializeResponse.error.message}`)
      }
      
      // Send tools/list request
      const toolsRequestId = Date.now() + 1
      const toolsRequest = {
        jsonrpc: "2.0",
        id: toolsRequestId,
        method: "tools/list",
        params: {}
      }
      
      await this.stdioManager.sendMessage(serverId, toolsRequest)
      const toolsResponse = await this.stdioManager.waitForResponse(serverId, toolsRequestId)
      
      if (toolsResponse.error) {
        throw new Error(`Failed to list tools from STDIO server: ${toolsResponse.error.message}`)
      }
      
      const tools = toolsResponse.result?.tools || []
      
      // Send resources/list request
      const resourcesRequestId = Date.now() + 2
      const resourcesRequest = {
        jsonrpc: "2.0",
        id: resourcesRequestId,
        method: "resources/list",
        params: {}
      }
      
      await this.stdioManager.sendMessage(serverId, resourcesRequest)
      const resourcesResponse = await this.stdioManager.waitForResponse(serverId, resourcesRequestId)
      
      if (resourcesResponse.error) {
        throw new Error(`Failed to list resources from STDIO server: ${resourcesResponse.error.message}`)
      }
      
      const resources = resourcesResponse.result?.resources || []
      
      Logger.info('Discovered STDIO server capabilities', { serverId, tools: tools.length, resources: resources.length })
      
      return { 
        tools, 
        resources 
      }
    } catch (error) {
      Logger.error('Failed to discover STDIO server capabilities', { serverId, error })
      throw error
    }
  }

  async callTool(serverId: string, toolName: string, args: any): Promise<any> {
    try {
      const toolRequestId = Date.now()
      const toolRequest = {
        jsonrpc: "2.0",
        id: toolRequestId,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args
        }
      }
      
      await this.stdioManager.sendMessage(serverId, toolRequest)
      const toolResponse = await this.stdioManager.waitForResponse(serverId, toolRequestId)
      
      if (toolResponse.error) {
        throw new Error(`Failed to call tool ${toolName} on STDIO server: ${toolResponse.error.message}`)
      }
      
      return toolResponse
    } catch (error) {
      Logger.error('STDIO tool call failed', { serverId, toolName, error })
      throw error
    }
  }

  async readResource(serverId: string, uri: string): Promise<any> {
    try {
      const resourceRequestId = Date.now()
      const resourceRequest = {
        jsonrpc: "2.0",
        id: resourceRequestId,
        method: "resources/read",
        params: { 
          uri
        }
      }
      
      await this.stdioManager.sendMessage(serverId, resourceRequest)
      const resourceResponse = await this.stdioManager.waitForResponse(serverId, resourceRequestId)
      
      if (resourceResponse.error) {
        throw new Error(`Failed to read resource ${uri} from STDIO server: ${resourceResponse.error.message}`)
      }
      
      return resourceResponse
    } catch (error) {
      Logger.error('STDIO resource read failed', { serverId, uri, error })
      throw error
    }
  }
}