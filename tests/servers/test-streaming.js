import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

async function runStreamingTest() {
  try {
    console.log('Testing Master MCP Server with HTTP Streaming...')
    
    // Create a streamable HTTP transport to connect to our MCP server
    const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3005/mcp'))
    
    // Create the MCP client
    const client = new Client({
      name: 'master-mcp-streaming-test-client',
      version: '1.0.0'
    })
    
    // Initialize the client
    await client.connect(transport)
    console.log('✅ Server initialized with streaming transport')
    console.log('Server info:', client.getServerVersion())
    console.log('Server capabilities:', client.getServerCapabilities())
    
    // List tools using streaming
    console.log('\n--- Testing tools/list with streaming ---')
    const toolsResult = await client.listTools({})
    console.log('✅ tools/list successful with streaming')
    console.log('Number of tools:', toolsResult.tools.length)
    
    // List resources using streaming
    console.log('\n--- Testing resources/list with streaming ---')
    const resourcesResult = await client.listResources({})
    console.log('✅ resources/list successful with streaming')
    console.log('Number of resources:', resourcesResult.resources.length)
    
    // Test ping
    console.log('\n--- Testing ping with streaming ---')
    const pingResult = await client.ping()
    console.log('✅ ping successful with streaming')
    console.log('Ping result:', pingResult)
    
    // Close the connection
    await client.close()
    console.log('\n✅ Disconnected from MCP server')
    console.log('\n🎉 All streaming tests completed successfully!')
    
  } catch (error) {
    console.error('❌ Streaming test failed:', error)
    console.error('Error stack:', error.stack)
  }
}

// Run the streaming test
runStreamingTest()