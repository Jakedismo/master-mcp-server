import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import express from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

// Create a simple test MCP server
const server = new McpServer({
  name: 'test-mcp-server',
  version: '1.0.0'
}, {
  capabilities: {
    tools: { listChanged: true },
    resources: { listChanged: true }
  }
})

// Register a simple tool
server.tool('echo', 'Echoes back the input', { message: { type: 'string' } }, async (args) => {
  return {
    content: [{
      type: 'text',
      text: `Echo: ${args.message}`
    }]
  }
})

// Register a simple resource
server.resource('test-resource', 'test://example', { description: 'A test resource' }, async () => {
  return {
    contents: [{
      uri: 'test://example',
      text: 'This is a test resource'
    }]
  }
})

// Create an Express app
const app = express()
app.use(express.json())

// Create the HTTP streaming transport
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined, // Stateless mode
  enableJsonResponse: false, // Use SSE by default
  enableDnsRebindingProtection: false
})

// Connect the server to the transport
await server.connect(transport)

// Handle MCP requests
app.post('/mcp', async (req, res) => {
  try {
    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    console.error('MCP request handling failed', { error })
    res.status(500).json({
      error: 'Internal server error'
    })
  }
})

app.get('/mcp', async (req, res) => {
  try {
    await transport.handleRequest(req, res)
  } catch (error) {
    console.error('MCP request handling failed', { error })
    res.status(500).json({
      error: 'Internal server error'
    })
  }
})

// Expose the capabilities endpoint
app.get('/capabilities', (req, res) => {
  res.json({
    tools: [
      {
        name: 'echo',
        description: 'Echoes back the input',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string'
            }
          },
          required: ['message']
        }
      }
    ],
    resources: [
      {
        uri: 'test://example',
        name: 'test-resource',
        description: 'A test resource'
      }
    ]
  })
})

// Start the server
const port = process.env.PORT || 3006
app.listen(port, () => {
  console.log(`Test MCP server listening on http://localhost:${port}`)
})