#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

async function startHttpServer() {
  console.log('Starting HTTP test server...')
  
  // Start the HTTP server as a background process
  const httpServer = spawn('node', ['examples/test-mcp-server.js'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '3006' }
  })
  
  // Capture stdout and stderr
  httpServer.stdout.on('data', (data) => {
    console.log(`[HTTP Server] ${data.toString().trim()}`)
  })
  
  httpServer.stderr.on('data', (data) => {
    console.error(`[HTTP Server ERROR] ${data.toString().trim()}`)
  })
  
  // Wait for the server to start
  await new Promise((resolve, reject) => {
    let timeout = setTimeout(() => {
      reject(new Error('HTTP server startup timeout'))
    }, 5000)
    
    httpServer.stdout.on('data', (data) => {
      if (data.toString().includes('Test MCP server listening')) {
        clearTimeout(timeout)
        resolve()
      }
    })
  })
  
  return httpServer
}

async function startMasterServer() {
  console.log('Starting Master MCP server...')
  
  // Start the master server as a background process
  const masterServer = spawn('npm', ['run', 'dev'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: process.cwd()
  })
  
  // Capture stdout and stderr
  masterServer.stdout.on('data', (data) => {
    const output = data.toString().trim()
    // Only log important messages to avoid too much output
    if (output.includes('Master MCP listening') || output.includes('error') || output.includes('ERROR')) {
      console.log(`[Master Server] ${output}`)
    }
  })
  
  masterServer.stderr.on('data', (data) => {
    console.error(`[Master Server ERROR] ${data.toString().trim()}`)
  })
  
  // Wait for the server to start
  await new Promise((resolve, reject) => {
    let timeout = setTimeout(() => {
      reject(new Error('Master server startup timeout'))
    }, 15000)
    
    masterServer.stdout.on('data', (data) => {
      if (data.toString().includes('Master MCP listening')) {
        clearTimeout(timeout)
        console.log('[Master Server] Server is ready!')
        resolve()
      }
    })
  })
  
  return masterServer
}

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
    console.log('Tools:', toolsResult.tools.map(t => t.name))
    
    // Verify both servers are present
    const hasHttpTool = toolsResult.tools.some(t => t.name === 'test-server.echo')
    const hasStdioTool = toolsResult.tools.some(t => t.name === 'stdio-server.stdio-echo')
    
    if (hasHttpTool) {
      console.log('✅ HTTP server tool found')
    } else {
      console.log('❌ HTTP server tool not found')
    }
    
    if (hasStdioTool) {
      console.log('✅ STDIO server tool found')
    } else {
      console.log('❌ STDIO server tool not found')
    }
    
    // List resources using streaming
    console.log('\n--- Testing resources/list with streaming ---')
    const resourcesResult = await client.listResources({})
    console.log('✅ resources/list successful with streaming')
    console.log('Number of resources:', resourcesResult.resources.length)
    console.log('Resources:', resourcesResult.resources.map(r => r.uri))
    
    // Verify both servers are present
    const hasHttpResource = resourcesResult.resources.some(r => r.uri === 'test-server.test://example')
    const hasStdioResource = resourcesResult.resources.some(r => r.uri === 'stdio-server.stdio://example/resource')
    
    if (hasHttpResource) {
      console.log('✅ HTTP server resource found')
    } else {
      console.log('❌ HTTP server resource not found')
    }
    
    if (hasStdioResource) {
      console.log('✅ STDIO server resource found')
    } else {
      console.log('❌ STDIO server resource not found')
    }
    
    // Test ping
    console.log('\n--- Testing ping with streaming ---')
    const pingResult = await client.ping()
    console.log('✅ ping successful with streaming')
    console.log('Ping result:', pingResult)
    
    // Summary
    console.log('\n--- Test Summary ---')
    if (hasHttpTool && hasStdioTool && hasHttpResource && hasStdioResource) {
      console.log('🎉 All tests passed! Both HTTP and STDIO servers are working correctly.')
    } else {
      console.log('⚠️ Some tests failed. Check the output above for details.')
    }
    
    // Close the connection
    await client.close()
    console.log('\n✅ Disconnected from MCP server')
    
  } catch (error) {
    console.error('❌ Streaming test failed:', error)
    console.error('Error stack:', error.stack)
  }
}

async function main() {
  let httpServer, masterServer
  
  try {
    // Start the HTTP server
    httpServer = await startHttpServer()
    
    // Start the master server
    masterServer = await startMasterServer()
    
    // Wait a bit for discovery to happen
    console.log('Waiting for server discovery...')
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Run the streaming test
    await runStreamingTest()
  } catch (error) {
    console.error('Test failed:', error)
  } finally {
    // Clean up: kill the servers
    if (httpServer) {
      console.log('Stopping HTTP server...')
      httpServer.kill()
    }
    if (masterServer) {
      console.log('Stopping Master server...')
      masterServer.kill()
    }
  }
}

// Run the test
main()