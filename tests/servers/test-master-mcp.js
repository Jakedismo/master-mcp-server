import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

async function runTest() {
  try {
    console.log('Testing Master MCP Server...')
    
    // Create a streamable HTTP transport to connect to our MCP server
    const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3005/mcp'))
    
    // Create the MCP client
    const client = new Client({
      name: 'master-mcp-test-client',
      version: '1.0.0'
    })
    
    // Initialize the client
    await client.connect(transport)
    console.log('✅ Server initialized')
    console.log('Server info:', client.getServerVersion())
    console.log('Protocol version:', client.getServerCapabilities())
    
    // List tools
    console.log('\n--- Testing tools/list ---')
    const toolsResult = await client.listTools({})
    console.log('✅ tools/list successful')
    console.log('Number of tools:', toolsResult.tools.length)
    console.log('Tools:', toolsResult.tools.map(t => t.name))
    
    // List resources
    console.log('\n--- Testing resources/list ---')
    const resourcesResult = await client.listResources({})
    console.log('✅ resources/list successful')
    console.log('Number of resources:', resourcesResult.resources.length)
    console.log('Resources:', resourcesResult.resources.map(r => r.uri))
    
    // Test ping
    console.log('\n--- Testing ping ---')
    const pingResult = await client.ping()
    console.log('✅ ping successful')
    console.log('Ping result:', pingResult)
    
    // Close the connection
    await client.close()
    console.log('\n✅ Disconnected from MCP server')
    console.log('\n🎉 All tests completed successfully!')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    console.error('Error stack:', error.stack)
  }
}

// Run the test
runTest()