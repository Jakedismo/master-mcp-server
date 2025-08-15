# Master MCP Server Implementation Plan

## Project Overview

**Goal**: Implement a Master MCP Server that aggregates multiple MCP servers behind a single endpoint with flexible authentication strategies, supporting servers with their own OAuth implementations.

**Tech Stack**: TypeScript/Node.js with MCP SDK
**Target Platforms**: Cloudflare Workers, Koyeb, Docker
**Key Features**: Multi-auth support, dynamic server loading, capability aggregation

## Phase 1: Project Setup and Core Structure

### Task 1.1: Initialize Project Structure

```bash
master-mcp-server/
├── src/
│   ├── index.ts                 # Main entry point
│   ├── server/
│   │   ├── master-server.ts     # Core master server
│   │   └── protocol-handler.ts  # MCP protocol implementation
│   ├── auth/
│   │   ├── multi-auth-manager.ts    # Multi-authentication manager
│   │   ├── oauth-providers.ts       # OAuth provider implementations
│   │   └── token-manager.ts         # Token storage and management
│   ├── modules/
│   │   ├── module-loader.ts         # Dynamic server loading
│   │   ├── capability-aggregator.ts # Tool/resource aggregation
│   │   └── request-router.ts        # Request routing logic
│   ├── types/
│   │   ├── config.ts               # Configuration types
│   │   ├── auth.ts                 # Authentication types
│   │   └── server.ts               # Server instance types
│   ├── utils/
│   │   ├── logger.ts               # Logging utilities
│   │   ├── crypto.ts               # Cryptographic utilities
│   │   └── validators.ts           # Input validation
│   └── config/
│       └── config-loader.ts        # Configuration loading
├── tests/
├── deploy/
│   ├── cloudflare/
│   ├── docker/
│   └── koyeb/
├── examples/
│   └── sample-configs/
├── package.json
├── tsconfig.json
└── README.md
```

**Implementation Steps:**

1. Initialize npm project with TypeScript
2. Install dependencies: `@modelcontextprotocol/sdk`, `express`, `node-fetch`, `yaml`, `jsonwebtoken`, `crypto`
3. Set up TypeScript configuration
4. Create basic project structure
5. Set up ESLint and Prettier

### Task 1.2: Define Core Types and Interfaces

Create `src/types/config.ts`:

```typescript
export interface MasterConfig {
  master_oauth: MasterOAuthConfig;
  servers: ServerConfig[];
  oauth_delegation?: OAuthDelegationConfig;
  hosting: HostingConfig;
}

export interface ServerConfig {
  id: string;
  type: 'git' | 'npm' | 'pypi' | 'docker' | 'local';
  url?: string;
  package?: string;
  version?: string;
  branch?: string;
  auth_strategy: AuthStrategy;
  auth_config?: ServerAuthConfig;
  config: {
    environment?: Record<string, string>;
    args?: string[];
    port?: number;
  };
}

export enum AuthStrategy {
  MASTER_OAUTH = 'master_oauth',
  DELEGATE_OAUTH = 'delegate_oauth', 
  BYPASS_AUTH = 'bypass_auth',
  PROXY_OAUTH = 'proxy_oauth'
}
```

Create `src/types/auth.ts`:

```typescript
export interface AuthHeaders {
  [key: string]: string;
}

export interface OAuthDelegation {
  type: 'oauth_delegation';
  auth_endpoint: string;
  token_endpoint: string;
  client_info: ClientInfo;
  required_scopes: string[];
  redirect_after_auth: boolean;
}

export interface OAuthToken {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope: string[];
  user_info?: any;
}
```

Create `src/types/server.ts`:

```typescript
export interface LoadedServer {
  id: string;
  type: ServerType;
  process?: ServerProcess;
  endpoint: string;
  config: ServerConfig;
  capabilities?: ServerCapabilities;
  status: 'starting' | 'running' | 'stopped' | 'error';
  lastHealthCheck: number;
}

export interface ServerCapabilities {
  tools: ToolDefinition[];
  resources: ResourceDefinition[];
  prompts?: PromptDefinition[];
}
```

## Phase 2: Authentication System

### Task 2.1: Implement Multi-Authentication Manager

Create `src/auth/multi-auth-manager.ts`:

**Core Methods to Implement:**

```typescript
export class MultiAuthManager {
  private tokenStore: Map<string, OAuthToken>;
  private serverAuthConfigs: Map<string, ServerAuthConfig>;
  private delegatedTokens: Map<string, Map<string, string>>;

  // IMPLEMENT: Initialize with master OAuth config
  constructor(config: MasterAuthConfig) {}

  // IMPLEMENT: Register auth config for a specific server
  registerServerAuth(serverId: string, authConfig: ServerAuthConfig): void {}

  // IMPLEMENT: Validate client token against master OAuth
  async validateClientToken(token: string): Promise<boolean> {}

  // IMPLEMENT: Prepare authentication for backend server based on strategy
  async prepareAuthForBackend(serverId: string, clientToken: string): Promise<AuthHeaders | OAuthDelegation> {}

  // IMPLEMENT: Handle master OAuth strategy
  private async handleMasterOAuth(serverId: string, clientToken: string): Promise<AuthHeaders> {}

  // IMPLEMENT: Handle delegated OAuth strategy
  private async handleDelegatedOAuth(serverId: string, clientToken: string, serverAuthConfig: ServerAuthConfig): Promise<OAuthDelegation> {}

  // IMPLEMENT: Handle OAuth proxy strategy  
  private async handleProxyOAuth(serverId: string, clientToken: string, serverAuthConfig: ServerAuthConfig): Promise<AuthHeaders> {}

  // IMPLEMENT: Store server-specific tokens for clients
  async storeDelegatedToken(clientToken: string, serverId: string, serverToken: string): Promise<void> {}

  // IMPLEMENT: Retrieve stored server token for client
  async getStoredServerToken(serverId: string, clientToken: string): Promise<string | undefined> {}
}
```

**Implementation Requirements:**

1. Support JWT token validation for master OAuth
2. Implement token encryption for storage
3. Handle token expiration and refresh
4. Implement OAuth flows for each strategy
5. Add comprehensive error handling
6. Include rate limiting for auth requests

### Task 2.2: Implement OAuth Providers

Create `src/auth/oauth-providers.ts`:

**Methods to Implement:**

```typescript
export interface OAuthProvider {
  validateToken(token: string): Promise<TokenValidationResult>;
  refreshToken(refreshToken: string): Promise<OAuthToken>;
  getUserInfo(token: string): Promise<UserInfo>;
}

export class GitHubOAuthProvider implements OAuthProvider {
  // IMPLEMENT: Validate GitHub tokens via GitHub API
  async validateToken(token: string): Promise<TokenValidationResult> {}
  
  // IMPLEMENT: Refresh GitHub tokens
  async refreshToken(refreshToken: string): Promise<OAuthToken> {}
  
  // IMPLEMENT: Get GitHub user info
  async getUserInfo(token: string): Promise<UserInfo> {}
}

export class GoogleOAuthProvider implements OAuthProvider {
  // IMPLEMENT: Similar methods for Google OAuth
}

export class CustomOAuthProvider implements OAuthProvider {
  // IMPLEMENT: Generic OIDC/OAuth2 provider
}
```

### Task 2.3: Implement Token Manager

Create `src/auth/token-manager.ts`:

**Methods to Implement:**

```typescript
export class TokenManager {
  // IMPLEMENT: Encrypt and store tokens securely
  async storeToken(key: string, token: OAuthToken): Promise<void> {}
  
  // IMPLEMENT: Retrieve and decrypt tokens
  async getToken(key: string): Promise<OAuthToken | null> {}
  
  // IMPLEMENT: Remove expired tokens
  async cleanupExpiredTokens(): Promise<void> {}
  
  // IMPLEMENT: Generate secure state parameters for OAuth flows
  generateState(data: any): string {}
  
  // IMPLEMENT: Validate state parameters
  validateState(state: string, expectedData: any): boolean {}
}
```

## Phase 3: Module Loading System

### Task 3.1: Implement Module Loader

Create `src/modules/module-loader.ts`:

**Core Methods to Implement:**

```typescript
export class ModuleLoader {
  private loadedServers: Map<string, LoadedServer>;
  private healthCheckInterval?: NodeJS.Timeout;

  // IMPLEMENT: Load all servers from configuration
  async loadServers(serverConfigs: ServerConfig[]): Promise<void> {}

  // IMPLEMENT: Load server from Git repository
  private async loadFromGit(config: ServerConfig): Promise<LoadedServer> {}

  // IMPLEMENT: Load server from NPM package
  private async loadFromNpm(config: ServerConfig): Promise<LoadedServer> {}

  // IMPLEMENT: Load server from PyPI package
  private async loadFromPypi(config: ServerConfig): Promise<LoadedServer> {}

  // IMPLEMENT: Load server from Docker image
  private async loadFromDocker(config: ServerConfig): Promise<LoadedServer> {}

  // IMPLEMENT: Detect server type (Python/TypeScript/etc)
  private async detectServerType(path: string): Promise<ServerType> {}

  // IMPLEMENT: Start Python MCP server process
  private async startPythonServer(path: string, config: ServerConfig): Promise<LoadedServer> {}

  // IMPLEMENT: Start TypeScript/Node.js MCP server process
  private async startTypeScriptServer(path: string, config: ServerConfig): Promise<LoadedServer> {}

  // IMPLEMENT: Health check for loaded servers
  private async performHealthCheck(server: LoadedServer): Promise<boolean> {}

  // IMPLEMENT: Restart failed servers
  private async restartServer(serverId: string): Promise<void> {}

  // IMPLEMENT: Get server by ID
  getServer(serverId: string): LoadedServer | undefined {}

  // IMPLEMENT: Get all loaded servers
  getLoadedServers(): Map<string, LoadedServer> {}
}
```

**Implementation Requirements:**

1. Clone Git repositories to temporary directories
2. Install dependencies for each server type
3. Start servers with proper environment variables
4. Monitor server health and restart on failure
5. Handle server lifecycle (start, stop, restart)
6. Clean up resources on shutdown

### Task 3.2: Implement Capability Aggregator

Create `src/modules/capability-aggregator.ts`:

**Methods to Implement:**

```typescript
export class CapabilityAggregator {
  private aggregatedTools: Map<string, ToolDefinition>;
  private aggregatedResources: Map<string, ResourceDefinition>;
  private serverCapabilities: Map<string, ServerCapabilities>;

  // IMPLEMENT: Discover capabilities from all loaded servers
  async discoverCapabilities(servers: Map<string, LoadedServer>): Promise<void> {}

  // IMPLEMENT: Query individual server for capabilities
  private async discoverServerCapabilities(serverId: string, server: LoadedServer): Promise<void> {}

  // IMPLEMENT: Merge capabilities from all servers with conflict resolution
  private mergeCapabilities(): void {}

  // IMPLEMENT: Get all aggregated tools
  getAllTools(): ListToolsResult {}

  // IMPLEMENT: Get all aggregated resources  
  getAllResources(): ListResourcesResult {}

  // IMPLEMENT: Find which server owns a specific tool
  getToolServer(toolName: string): string | undefined {}

  // IMPLEMENT: Find which server owns a specific resource
  getResourceServer(resourceUri: string): string | undefined {}

  // IMPLEMENT: Get original tool name (remove prefix)
  getOriginalToolName(prefixedName: string): string {}

  // IMPLEMENT: Get original resource URI (remove prefix)
  getOriginalResourceUri(prefixedUri: string): string {}

  // IMPLEMENT: Refresh capabilities for specific server
  async refreshServerCapabilities(serverId: string): Promise<void> {}
}
```

**Implementation Requirements:**

1. Query each server's `list_tools` and `list_resources` endpoints
2. Add server ID prefixes to avoid naming conflicts
3. Store mapping of prefixed names to original names and server IDs
4. Handle capability updates when servers restart
5. Validate tool and resource schemas

## Phase 4: Request Routing System

### Task 4.1: Implement Request Router

Create `src/modules/request-router.ts`:

**Methods to Implement:**

```typescript
export class RequestRouter {
  constructor(
    private capabilityAggregator: CapabilityAggregator,
    private moduleLoader: ModuleLoader,
    private multiAuthManager: MultiAuthManager
  ) {}

  // IMPLEMENT: Route tool calls to appropriate backend server
  async routeToolCall(request: CallToolRequest): Promise<CallToolResult> {}

  // IMPLEMENT: Route resource reads to appropriate backend server
  async routeResourceRead(request: ReadResourceRequest): Promise<ReadResourceResult> {}

  // IMPLEMENT: Handle OAuth delegation scenarios
  private async handleOAuthDelegation(serverId: string, delegation: OAuthDelegation, originalRequest: CallToolRequest): Promise<CallToolResult> {}

  // IMPLEMENT: Forward request to backend server
  private async forwardRequest(server: LoadedServer, method: string, request: any, authHeaders: AuthHeaders): Promise<any> {}

  // IMPLEMENT: Handle server communication errors
  private async handleServerError(serverId: string, error: Error, request: any): Promise<any> {}

  // IMPLEMENT: Load balance requests across multiple instances
  private selectServerInstance(serverId: string): LoadedServer {}
}
```

**Implementation Requirements:**

1. Extract server ID from prefixed tool/resource names
2. Prepare authentication headers based on server's auth strategy
3. Transform requests to backend server format
4. Handle HTTP communication with backend servers
5. Implement retry logic for failed requests
6. Support circuit breaker pattern for unhealthy servers

## Phase 5: Core Master Server

### Task 5.1: Implement Protocol Handler

Create `src/server/protocol-handler.ts`:

**Methods to Implement:**

```typescript
export class ProtocolHandler {
  constructor(
    private capabilityAggregator: CapabilityAggregator,
    private requestRouter: RequestRouter,
    private multiAuthManager: MultiAuthManager
  ) {}

  // IMPLEMENT: Handle list_tools requests
  async handleListTools(request: ListToolsRequest): Promise<ListToolsResult> {}

  // IMPLEMENT: Handle call_tool requests
  async handleCallTool(request: CallToolRequest): Promise<CallToolResult> {}

  // IMPLEMENT: Handle list_resources requests
  async handleListResources(request: ListResourcesRequest): Promise<ListResourcesResult> {}

  // IMPLEMENT: Handle read_resource requests
  async handleReadResource(request: ReadResourceRequest): Promise<ReadResourceResult> {}

  // IMPLEMENT: Handle subscribe requests for notifications
  async handleSubscribe(request: SubscribeRequest): Promise<SubscribeResult> {}

  // IMPLEMENT: Validate incoming requests
  private validateRequest(request: any): boolean {}

  // IMPLEMENT: Extract authentication from request
  private extractAuth(request: any): AuthInfo | null {}
}
```

### Task 5.2: Implement Master Server

Create `src/server/master-server.ts`:

**Core Implementation:**

```typescript
export class MasterMcpServer {
  private server: McpServer;
  private moduleLoader: ModuleLoader;
  private capabilityAggregator: CapabilityAggregator;
  private requestRouter: RequestRouter;
  private multiAuthManager: MultiAuthManager;
  private protocolHandler: ProtocolHandler;

  constructor(config: MasterConfig) {
    // IMPLEMENT: Initialize all components
  }

  // IMPLEMENT: Initialize and start the master server
  async initialize(): Promise<void> {
    // 1. Initialize multi-auth manager
    // 2. Load all configured servers
    // 3. Discover capabilities
    // 4. Set up request handlers
    // 5. Start health monitoring
    // 6. Start the MCP server
  }

  // IMPLEMENT: Set up MCP protocol request handlers
  private setupRequestHandlers(): void {}

  // IMPLEMENT: Handle OAuth callback endpoints
  async handleOAuthCallback(serverId: string, code: string, state: string): Promise<void> {}

  // IMPLEMENT: Graceful shutdown
  async shutdown(): Promise<void> {}

  // IMPLEMENT: Health check endpoint
  async getHealthStatus(): Promise<HealthStatus> {}
}
```

## Phase 6: Configuration System

### Task 6.1: Implement Configuration Loader

Create `src/config/config-loader.ts`:

**Methods to Implement:**

```typescript
export class ConfigLoader {
  // IMPLEMENT: Load configuration from YAML file
  static async loadFromFile(filePath: string): Promise<MasterConfig> {}

  // IMPLEMENT: Load configuration from environment variables
  static loadFromEnv(): Promise<MasterConfig> {}

  // IMPLEMENT: Validate configuration schema
  static validateConfig(config: any): MasterConfig {}

  // IMPLEMENT: Resolve environment variable references
  private static resolveEnvVars(config: any): any {}

  // IMPLEMENT: Merge configuration sources
  static mergeConfigs(base: MasterConfig, override: Partial<MasterConfig>): MasterConfig {}
}
```

## Phase 7: OAuth Flow Handling

### Task 7.1: Implement OAuth Endpoints

Create `src/auth/oauth-endpoints.ts`:

**Methods to Implement:**

```typescript
export class OAuthEndpoints {
  constructor(private multiAuthManager: MultiAuthManager) {}

  // IMPLEMENT: OAuth callback handler
  async handleCallback(serverId: string, code: string, state: string): Promise<Response> {}

  // IMPLEMENT: OAuth success page
  async renderSuccessPage(serverId: string): Promise<Response> {}

  // IMPLEMENT: OAuth error page  
  async renderErrorPage(error: string): Promise<Response> {}

  // IMPLEMENT: Build OAuth authorization URL
  buildAuthUrl(serverId: string, clientToken: string): string {}

  // IMPLEMENT: Validate OAuth state parameter
  validateState(state: string, serverId: string): boolean {}
}
```

## Phase 8: Utilities and Helpers

### Task 8.1: Implement Logger

Create `src/utils/logger.ts`:

**Methods to Implement:**

```typescript
export class Logger {
  // IMPLEMENT: Structured logging with levels
  static info(message: string, context?: any): void {}
  static warn(message: string, context?: any): void {}
  static error(message: string, context?: any): void {}
  static debug(message: string, context?: any): void {}
  
  // IMPLEMENT: Log authentication events
  static logAuthEvent(event: string, context: AuthContext): void {}
  
  // IMPLEMENT: Log server lifecycle events
  static logServerEvent(event: string, serverId: string, context?: any): void {}
}
```

### Task 8.2: Implement Crypto Utilities

Create `src/utils/crypto.ts`:

**Methods to Implement:**

```typescript
export class CryptoUtils {
  // IMPLEMENT: Encrypt sensitive data
  static encrypt(data: string, key: string): string {}
  
  // IMPLEMENT: Decrypt sensitive data
  static decrypt(encryptedData: string, key: string): string {}
  
  // IMPLEMENT: Generate secure random strings
  static generateSecureRandom(length: number): string {}
  
  // IMPLEMENT: Hash passwords/tokens
  static hash(input: string): string {}
  
  // IMPLEMENT: Verify hashed values
  static verify(input: string, hash: string): boolean {}
}
```

## Phase 9: Testing Strategy

### Task 9.1: Unit Tests

**Test Files to Create:**

- `tests/auth/multi-auth-manager.test.ts`
- `tests/modules/module-loader.test.ts`
- `tests/modules/capability-aggregator.test.ts`
- `tests/modules/request-router.test.ts`
- `tests/server/master-server.test.ts`

**Test Requirements:**

1. Mock external HTTP calls
2. Test all authentication strategies
3. Test server loading and failure scenarios
4. Test capability aggregation with conflicts
5. Test request routing with various auth states
6. Test OAuth flows end-to-end

### Task 9.2: Integration Tests

**Integration Test Scenarios:**

1. Load real MCP servers from repositories
2. Test mixed authentication environment
3. Test server restart and recovery
4. Test OAuth delegation flows
5. Test capability discovery and aggregation
6. Test load balancing and failover

### Task 9.3: Mock MCP Servers

Create test servers in `tests/fixtures/`:

- `mock-oauth-server/` - Server with its own OAuth
- `mock-simple-server/` - Server with no auth
- `mock-shared-auth-server/` - Server using master auth

## Phase 10: Deployment Configurations

### Task 10.1: Cloudflare Workers Deployment

Create `deploy/cloudflare/worker.ts`:

**Implementation Requirements:**

1. Adapt master server for Cloudflare Workers runtime
2. Handle OAuth callbacks in serverless environment
3. Implement KV storage for tokens
4. Set up Durable Objects for server state
5. Configure environment variables

### Task 10.2: Docker Deployment

Create `deploy/docker/Dockerfile`:

**Implementation Requirements:**

1. Multi-stage build for TypeScript compilation
2. Include Python and Node.js runtimes for backend servers
3. Set up volume mounts for server repositories
4. Configure health checks
5. Set up container networking

### Task 10.3: Koyeb Deployment

Create `deploy/koyeb/koyeb.yaml`:

**Implementation Requirements:**

1. Configure autoscaling settings
2. Set up environment variable injection
3. Configure persistent storage for repositories
4. Set up health check endpoints

## Phase 11: Documentation and Examples

### Task 11.1: Create Example Configurations

Create example configs in `examples/`:

- `simple-setup.yaml` - Basic configuration
- `mixed-auth.yaml` - Servers with different auth strategies
- `enterprise.yaml` - Enterprise SSO + external OAuth
- `development.yaml` - Local development setup

### Task 11.2: Write Integration Guide

Create documentation for:

1. How to migrate existing MCP servers
2. OAuth configuration for different providers
3. Troubleshooting authentication issues
4. Performance tuning and scaling
5. Security best practices

## Implementation Priority

**Phase 1-2**: Core project structure and authentication system (Week 1-2)
**Phase 3-4**: Module loading and request routing (Week 3)
**Phase 5-6**: Master server and configuration (Week 4)
**Phase 7-8**: OAuth flows and utilities (Week 5)
**Phase 9**: Testing (Week 6)
**Phase 10-11**: Deployment and documentation (Week 7)

## Success Criteria

1. ✅ Load existing MCP servers without code changes
2. ✅ Support all four authentication strategies
3. ✅ Handle OAuth delegation for servers with own auth
4. ✅ Aggregate capabilities from multiple servers
5. ✅ Route requests to appropriate backend servers
6. ✅ Deploy to serverless platforms with scale-to-zero
7. ✅ Comprehensive test coverage (>90%)
8. ✅ Complete documentation and examples

## Code Quality Requirements

- **TypeScript**: Strict mode enabled, full type coverage
- **Testing**: Jest with 90%+ coverage
- **Linting**: ESLint with strict rules
- **Documentation**: JSDoc for all public APIs
- **Security**: No hardcoded secrets, encrypted token storage
- **Performance**: <100ms response time for tool routing
- **Reliability**: 99.9% uptime with proper error handling

This implementation plan provides a coding agent with concrete, actionable tasks to build the complete Master MCP Server system.
