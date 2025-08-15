import type { MasterConfig, ServerAuthConfig } from '../types/config.js'

export interface ProviderResolution {
  providerId: string
  serverId?: string
  config: ServerAuthConfig
}

export class FlowValidator {
  constructor(private readonly getConfig: () => MasterConfig) {}

  resolveProvider(params: { provider?: string | null; serverId?: string | null }): ProviderResolution {
    const cfg = this.getConfig()
    const provider = params.provider ?? undefined
    const serverId = params.serverId ?? undefined

    if (!provider && !serverId) {
      return {
        providerId: 'master',
        config: {
          provider: 'custom',
          authorization_endpoint: cfg.master_oauth.authorization_endpoint,
          token_endpoint: cfg.master_oauth.token_endpoint,
          client_id: cfg.master_oauth.client_id,
          client_secret: cfg.master_oauth.client_secret,
          scopes: cfg.master_oauth.scopes,
        },
      }
    }

    if (provider === 'master') {
      return {
        providerId: 'master',
        config: {
          provider: 'custom',
          authorization_endpoint: cfg.master_oauth.authorization_endpoint,
          token_endpoint: cfg.master_oauth.token_endpoint,
          client_id: cfg.master_oauth.client_id,
          client_secret: cfg.master_oauth.client_secret,
          scopes: cfg.master_oauth.scopes,
        },
      }
    }

    if (serverId) {
      const server = cfg.servers.find((s) => s.id === serverId)
      if (!server || !server.auth_config) throw new Error('Unknown server or missing auth configuration')
      return { providerId: provider ?? serverId, serverId, config: server.auth_config }
    }

    const pre = cfg.oauth_delegation?.providers?.[String(provider)]
    if (!pre) throw new Error('Unknown provider')
    return { providerId: String(provider), config: pre }
  }

  validateReturnTo(returnTo: string | null | undefined, baseUrl?: string): string | undefined {
    if (!returnTo) return undefined
    try {
      // Allow relative paths only, or same-origin absolute if matches baseUrl
      if (returnTo.startsWith('/')) return returnTo
      if (baseUrl) {
        const origin = new URL(baseUrl).origin
        const u = new URL(returnTo)
        if (u.origin === origin) return u.pathname + u.search + u.hash
      }
      return undefined
    } catch {
      return undefined
    }
  }
}

