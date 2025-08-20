# STDIO Server Support

The Master MCP Server now supports STDIO-based MCP servers in addition to HTTP-based servers. This allows you to aggregate both network-based and locally-running MCP servers through a single endpoint.

## Configuration

To configure a STDIO server, use a `file://` URL in your server configuration:

```json
{
  "servers": [
    {
      "id": "stdio-server",
      "type": "local",
      "url": "file://./path/to/your/stdio-mcp-server.cjs",
      "auth_strategy": "bypass_auth",
      "config": {
        "environment": {},
        "args": []
      }
    }
  ]
}
```

The Master MCP Server will automatically detect `file://` URLs and treat them as STDIO servers, starting them as child processes and communicating with them through stdin/stdout using JSON-RPC.

## How It Works

1. **Server Detection**: The Master MCP Server detects `file://` URLs and identifies them as STDIO servers
2. **Process Management**: STDIO servers are started as child processes
3. **Communication**: The Master MCP Server communicates with STDIO servers using JSON-RPC over stdin/stdout
4. **Capability Discovery**: The Master MCP Server discovers tools and resources from STDIO servers
5. **Request Routing**: Tool calls and resource reads are routed to the appropriate STDIO servers

## Benefits

- **Unified Interface**: Access both HTTP and STDIO servers through a single MCP endpoint
- **Process Isolation**: Each STDIO server runs in its own process for better isolation
- **Automatic Management**: The Master MCP Server handles process lifecycle management
- **Seamless Integration**: STDIO servers appear as regular MCP servers to clients

## Requirements

- STDIO servers must implement the MCP protocol using JSON-RPC over stdin/stdout
- STDIO servers should follow the MCP specification for initialization and capability discovery
- STDIO servers must be executable Node.js scripts (`.js` or `.cjs` files)

## Example STDIO Server

Here's a simple example of a STDIO server:

```javascript
// Simple STDIO server that implements the MCP protocol
// Save this as stdio-mcp-server.cjs and make it executable with chmod +x
```
process.stdin.on('data', async (data) => {
  try {
    const lines = data.toString().split('\n').filter(line => line.trim() !== '');
    for (const line of lines) {
      const request = JSON.parse(line);
      
      // Handle initialize request
      if (request.method === 'initialize') {
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: {
              tools: { listChanged: true },
              resources: { listChanged: true }
            },
            serverInfo: {
              name: 'example-stdio-server',
              version: '1.0.0'
            }
          }
        };
        process.stdout.write(JSON.stringify(response) + '\n');
      }
      // Handle other requests...
    }
  } catch (err) {
    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error',
        data: err.message
      }
    };
    process.stdout.write(JSON.stringify(errorResponse) + '\n');
  }
});
```

Make sure to make your STDIO server executable:

```bash
chmod +x ./path/to/your/stdio-mcp-server.cjs
```