import type { MasterConfig } from '../types/config.js'
import type { OAuthToken } from '../types/auth.js'
import { PKCEManager } from './pkce-manager.js'
import { StateManager } from './state-manager.js'
import { FlowValidator } from './flow-validator.js'
import { CallbackHandler } from './callback-handler.js'
import { WebInterface } from './web-interface.js'
import { Logger } from '../utils/logger.js'

export interface FlowControllerDeps {
  getConfig: () => MasterConfig
  // Called to store a delegated token when server + client context is known
  storeDelegatedToken?: (clientToken: string, serverId: string, token: OAuthToken) => Promise<void>
}

export class OAuthFlowController {
  private readonly pkce = new PKCEManager()
  private readonly state = new StateManager()
  private readonly validator: FlowValidator
  private readonly web = new WebInterface()
  private readonly deps: FlowControllerDeps
  private readonly basePath: string

  constructor(deps: FlowControllerDeps, basePath = '/oauth') {
    this.validator = new FlowValidator(deps.getConfig)
    this.deps = deps
    this.basePath = basePath
  }

  // Compute baseUrl from request context
  private getBaseUrlFromExpress(req: any): string {
    const cfg = this.deps.getConfig()
    if (cfg.hosting?.base_url) return cfg.hosting.base_url
    const proto = (req.protocol as string) || 'http'
    const host = (req.get?.('host') as string) || req.headers?.host
    return `${proto}://${host}`
  }

  private getBaseUrlFromRequest(req: Request): string {
    const cfg = this.deps.getConfig()
    if (cfg.hosting?.base_url) return cfg.hosting.base_url
    try {
      const u = new URL(req.url)
      return `${u.protocol}//${u.host}`
    } catch {
      return 'http://localhost'
    }
  }

  // Express registration (no direct dependency on express types)
  registerExpress(app: any): void {
    const base = this.basePath
    // GET /oauth/authorize
    app.get(`${base}/authorize`, async (req: any, res: any) => {
      try {
        const query = req.query || {}
        const providerParam = typeof query.provider === 'string' ? query.provider : undefined
        const serverId = typeof query.server_id === 'string' ? query.server_id : undefined
        const scopesParam = typeof query.scope === 'string' ? query.scope : undefined
        const returnTo = this.validator.validateReturnTo(
          typeof query.return_to === 'string' ? query.return_to : undefined,
          this.getBaseUrlFromExpress(req)
        )
        const { config, providerId } = this.validator.resolveProvider({ provider: providerParam, serverId })
        const state = this.state.create({ provider: providerId, serverId, clientToken: this.getClientTokenFromExpress(req), returnTo })
        const { challenge, method } = await this.pkce.generate(state)
        const baseUrl = this.getBaseUrlFromExpress(req)
        const redirectUri = new URL(`${this.basePath}/callback`, baseUrl).toString()
        const authUrl = new URL(config.authorization_endpoint)
        authUrl.searchParams.set('response_type', 'code')
        authUrl.searchParams.set('client_id', config.client_id)
        authUrl.searchParams.set('redirect_uri', redirectUri)
        const scope = scopesParam ?? (config.scopes ? config.scopes.join(' ') : '')
        if (scope) authUrl.searchParams.set('scope', scope)
        authUrl.searchParams.set('state', state)
        authUrl.searchParams.set('code_challenge', challenge)
        authUrl.searchParams.set('code_challenge_method', method)

        // Render a small redirect page to avoid exposing long URLs in Location header logs
        res.set('content-type', 'text/html; charset=utf-8')
        res.status(200).send(this.web.renderRedirectPage(providerId, authUrl.toString()))
      } catch (err) {
        Logger.warn('OAuth authorize failed', err)
        res.redirect(`${this.basePath}/error`)
      }
    })

    // GET /oauth/callback
    app.get(`${base}/callback`, async (req: any, res: any) => {
      try {
        const params = new URLSearchParams(req.query as Record<string, string>)
        const providerParam = typeof req.query?.provider === 'string' ? (req.query.provider as string) : undefined
        const serverId = typeof req.query?.server_id === 'string' ? (req.query.server_id as string) : undefined
        const { config } = this.validator.resolveProvider({ provider: providerParam, serverId })
        const cb = new CallbackHandler({
          config: this.deps.getConfig(),
          pkceManager: this.pkce,
          stateManager: this.state,
          baseUrl: this.getBaseUrlFromExpress(req),
          storeDelegatedToken: this.deps.storeDelegatedToken,
        })
        const result = await cb.handleCallback(params, config)
        if (result.error) {
          res.redirect(`${this.basePath}/error?msg=${encodeURIComponent(result.error)}`)
          return
        }
        const returnTo = result.state?.returnTo
        if (returnTo) {
          res.redirect(returnTo)
        } else {
          res.set('content-type', 'text/html; charset=utf-8')
          res.status(200).send(this.web.renderSuccessPage('Authorization complete. You may close this window.'))
        }
      } catch (err) {
        Logger.warn('OAuth callback failed', err)
        res.redirect(`${this.basePath}/error`)
      }
    })

    // POST /oauth/token
    app.post(`${base}/token`, async (req: any, res: any) => {
      try {
        const body = req.body || {}
        const state = typeof body.state === 'string' ? body.state : undefined
        const code = typeof body.code === 'string' ? body.code : undefined
        const providerParam = typeof body.provider === 'string' ? body.provider : undefined
        const serverId = typeof body.server_id === 'string' ? body.server_id : undefined
        if (!state || !code) {
          res.status(400).json({ error: 'Missing state or code' })
          return
        }
        const { config } = this.validator.resolveProvider({ provider: providerParam, serverId })
        const cb = new CallbackHandler({
          config: this.deps.getConfig(),
          pkceManager: this.pkce,
          stateManager: this.state,
          baseUrl: this.getBaseUrlFromExpress(req),
          storeDelegatedToken: this.deps.storeDelegatedToken,
        })
        const result = await cb.handleCallback(new URLSearchParams({ state, code }), config)
        if (result.error) {
          res.status(400).json({ error: result.error })
          return
        }
        // For security, do not return tokens to the browser; we store server-side
        res.json({ ok: true })
      } catch (err) {
        Logger.warn('OAuth token exchange failed', err)
        res.status(500).json({ error: 'Token exchange failed' })
      }
    })

    // Success and error pages
    app.get(`${base}/success`, (_req: any, res: any) => {
      res.set('content-type', 'text/html; charset=utf-8')
      res.status(200).send(this.web.renderSuccessPage())
    })

    app.get(`${base}/error`, (req: any, res: any) => {
      const msg = typeof req.query?.msg === 'string' ? (req.query.msg as string) : undefined
      res.set('content-type', 'text/html; charset=utf-8')
      res.status(200).send(this.web.renderErrorPage(msg))
    })
  }

  private getClientTokenFromExpress(req: any): string | undefined {
    const h = (req.headers?.authorization as string) || (req.headers?.Authorization as string)
    if (typeof h === 'string' && h.toLowerCase().startsWith('bearer ')) return h.slice(7)
    return undefined
  }

  // Cross-platform Worker-style request handler
  async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname
    if (req.method === 'GET' && path.endsWith(`${this.basePath}/authorize`)) {
      try {
        const providerParam = (url.searchParams.get('provider') || undefined) as string | undefined
        const serverId = (url.searchParams.get('server_id') || undefined) as string | undefined
        const scopesParam = (url.searchParams.get('scope') || undefined) as string | undefined
        const returnTo = this.validator.validateReturnTo(url.searchParams.get('return_to'), this.getBaseUrlFromRequest(req))
        const { config, providerId } = this.validator.resolveProvider({ provider: providerParam, serverId })
        // Cannot reliably get Authorization header in some browser flows; ignore client token in Workers
        const state = this.state.create({ provider: providerId, serverId, clientToken: undefined, returnTo })
        const { challenge, method } = await this.pkce.generate(state)
        const redirectUri = new URL(`${this.basePath}/callback`, this.getBaseUrlFromRequest(req)).toString()
        const authUrl = new URL(config.authorization_endpoint)
        authUrl.searchParams.set('response_type', 'code')
        authUrl.searchParams.set('client_id', config.client_id)
        authUrl.searchParams.set('redirect_uri', redirectUri)
        const scope = scopesParam ?? (config.scopes ? config.scopes.join(' ') : '')
        if (scope) authUrl.searchParams.set('scope', scope)
        authUrl.searchParams.set('state', state)
        authUrl.searchParams.set('code_challenge', challenge)
        authUrl.searchParams.set('code_challenge_method', method)
        return new Response(this.web.renderRedirectPage(providerId, authUrl.toString()), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
          status: 200,
        })
      } catch (err) {
        Logger.warn('OAuth authorize (worker) failed', err)
        return new Response(this.web.renderErrorPage('Failed to start authorization'), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
          status: 500,
        })
      }
    }

    if (req.method === 'GET' && path.endsWith(`${this.basePath}/callback`)) {
      try {
        const params = new URLSearchParams(url.search)
        const providerParam = url.searchParams.get('provider')
        const serverId = url.searchParams.get('server_id')
        const { config } = this.validator.resolveProvider({ provider: providerParam, serverId })
        const cb = new CallbackHandler({
          config: this.deps.getConfig(),
          pkceManager: this.pkce,
          stateManager: this.state,
          baseUrl: this.getBaseUrlFromRequest(req),
          storeDelegatedToken: this.deps.storeDelegatedToken,
        })
        const result = await cb.handleCallback(params, config)
        if (result.error) {
          return new Response(this.web.renderErrorPage(result.error), {
            headers: { 'content-type': 'text/html; charset=utf-8' },
            status: 400,
          })
        }
        const returnTo = result.state?.returnTo
        if (returnTo) return Response.redirect(new URL(returnTo, this.getBaseUrlFromRequest(req)).toString(), 302)
        return new Response(this.web.renderSuccessPage('Authorization complete. You may close this window.'), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
          status: 200,
        })
      } catch (err) {
        Logger.warn('OAuth callback (worker) failed', err)
        return new Response(this.web.renderErrorPage('Callback handling failed'), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
          status: 500,
        })
      }
    }

    if (req.method === 'POST' && path.endsWith(`${this.basePath}/token`)) {
      try {
        const ct = req.headers.get('content-type') || ''
        let data: Record<string, string> = {}
        if (ct.includes('application/json')) {
          data = (await req.json()) as any
        } else if (ct.includes('application/x-www-form-urlencoded')) {
          data = Object.fromEntries(new URLSearchParams(await req.text())) as any
        } else {
          return new Response(JSON.stringify({ error: 'Unsupported content type' }), {
            headers: { 'content-type': 'application/json' },
            status: 415,
          })
        }
        const state = typeof data.state === 'string' ? data.state : undefined
        const code = typeof data.code === 'string' ? data.code : undefined
        const providerParam = typeof data.provider === 'string' ? data.provider : undefined
        const serverId = typeof data.server_id === 'string' ? data.server_id : undefined
        if (!state || !code) return new Response(JSON.stringify({ error: 'Missing state or code' }), { headers: { 'content-type': 'application/json' }, status: 400 })
        const { config } = this.validator.resolveProvider({ provider: providerParam, serverId })
        const cb = new CallbackHandler({
          config: this.deps.getConfig(),
          pkceManager: this.pkce,
          stateManager: this.state,
          baseUrl: this.getBaseUrlFromRequest(req),
          storeDelegatedToken: this.deps.storeDelegatedToken,
        })
        const result = await cb.handleCallback(new URLSearchParams({ state, code }), config)
        if (result.error) return new Response(JSON.stringify({ error: result.error }), { headers: { 'content-type': 'application/json' }, status: 400 })
        return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })
      } catch (err) {
        Logger.warn('OAuth token exchange (worker) failed', err)
        return new Response(JSON.stringify({ error: 'Token exchange failed' }), { headers: { 'content-type': 'application/json' }, status: 500 })
      }
    }

    if (req.method === 'GET' && path.endsWith(`${this.basePath}/success`)) {
      return new Response(this.web.renderSuccessPage(), { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
    if (req.method === 'GET' && path.endsWith(`${this.basePath}/error`)) {
      const msg = new URL(req.url).searchParams.get('msg') ?? undefined
      return new Response(this.web.renderErrorPage(msg || undefined), { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }

    return new Response('Not Found', { status: 404 })
  }
}
