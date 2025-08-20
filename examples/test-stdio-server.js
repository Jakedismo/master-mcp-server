#!/usr/bin/env node

// Simple test STDIO server for testing purposes

// Simple JSON-RPC server that echoes back requests

// Function to send a response
function sendResponse(response) {
  process.stdout.write(JSON.stringify(response) + '\n');
}

// Function to send a notification
function sendNotification(notification) {
  process.stdout.write(JSON.stringify(notification) + '\n');
}

// Handle incoming requests
process.stdin.on('data', (data) => {
  try {
    const lines = data.toString().split('\n').filter(line => line.trim() !== '');
    for (const line of lines) {
      if (line.trim() === '') continue;
      
      const request = JSON.parse(line);
      
      // Handle initialize request
      if (request.method === 'initialize') {
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: {
              tools: {
                listChanged: true
              },
              resources: {
                listChanged: true
              }
            },
            serverInfo: {
              name: 'test-stdio-server',
              version: '1.0.0'
            }
          }
        };
        sendResponse(response);
      }
      // Handle tools/list request
      else if (request.method === 'tools/list') {
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            tools: [
              {
                name: 'stdio-echo',
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
            ]
          }
        };
        sendResponse(response);
      }
      // Handle resources/list request
      else if (request.method === 'resources/list') {
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            resources: [
              {
                uri: 'stdio://example/resource',
                name: 'stdio-resource',
                description: 'A test resource from STDIO server'
              }
            ]
          }
        };
        sendResponse(response);
      }
      // Handle tools/call request
      else if (request.method === 'tools/call') {
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [
              {
                type: 'text',
                text: `STDIO Echo: ${request.params.arguments?.message || 'No message'}`
              }
            ]
          }
        };
        sendResponse(response);
      }
      // Handle resources/read request
      else if (request.method === 'resources/read') {
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            contents: [
              {
                uri: request.params.uri,
                text: 'This is content from a STDIO server resource',
                mimeType: 'text/plain'
              }
            ]
          }
        };
        sendResponse(response);
      }
      // Handle unknown methods
      else {
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Method not found: ${request.method}`
          }
        };
        sendResponse(response);
      }
    }
  } catch (err) {
    // Send error response
    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error',
        data: err.message
      }
    };
    sendResponse(errorResponse);
  }
});

// Send a notification that the server is ready
sendNotification({
  jsonrpc: '2.0',
  method: 'notifications/initialized',
  params: {}
});

console.error('Test STDIO server started');