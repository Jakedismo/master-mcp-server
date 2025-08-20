const { StdioManager } = require('./dist/node/modules/stdio-manager.js')
const { Logger } = require('./dist/node/utils/logger.js')

// Set logger to debug level
Logger.configure({ level: 'debug' })

async function testStdio() {
  const stdioManager = new StdioManager()
  const serverId = 'test-stdio-server'
  const filePath = './examples/stdio-mcp-server.cjs'
  
  try {
    console.log('Starting STDIO server...')
    const serverProcess = await stdioManager.startServer(serverId, filePath)
    console.log('STDIO server started successfully:', serverProcess)
    
    // Send a simple request to see if we can communicate
    console.log('Sending initialize request...')
    const initializeRequestId = Date.now()
    const initializeRequest = {
      jsonrpc: "2.0",
      id: initializeRequestId,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { 
          name: "debug-script",
          version: "1.0.0"
        }
      }
    }
    
    await stdioManager.sendMessage(serverId, initializeRequest)
    console.log('Initialize request sent')
    
    // Wait for response
    console.log('Waiting for response...')
    const response = await stdioManager.waitForResponse(serverId, initializeRequestId, 5000) // 5 second timeout
    console.log('Received response:', response)
    
    // Stop the server
    console.log('Stopping server...')
    await serverProcess.stop()
    console.log('Server stopped')
  } catch (error) {
    console.error('Error in STDIO test:', error)
  }
}

testStdio()