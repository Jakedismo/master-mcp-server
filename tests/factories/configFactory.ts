import type { MasterConfig, ServerConfig, AuthStrategy } from '../../src/types/config.js'

export function makeServerConfig(id: string, endpoint: string, authStrategy: AuthStrategy = 0 as any): ServerConfig {
  return {
    id,
    type: 'local',
    url: endpoint,
    auth_strategy: authStrategy || 'bypass_auth',
    config: { port: new URL(endpoint).port ? Number(new URL(endpoint).port) : undefined },
  }
}

export function makeMasterConfig(params: {
  servers: Array<{ id: string; endpoint: string }>
  hosting?: Partial<MasterConfig['hosting']>
  routing?: MasterConfig['routing']
  master_oauth?: Partial<MasterConfig['master_oauth']>
}): MasterConfig {
  const servers: ServerConfig[] = params.servers.map((s) => makeServerConfig(s.id, s.endpoint))
  return {
    master_oauth: {
      authorization_endpoint: 'http://localhost/authorize',
      token_endpoint: 'http://localhost/token',
      client_id: 'local',
      redirect_uri: 'http://localhost/oauth/callback',
      scopes: ['openid'],
      ...(params.master_oauth ?? {}),
    },
    servers,
    hosting: { platform: 'node', port: 0, ...(params.hosting ?? {}) },
    routing: params.routing,
  }
}

