import { createMockServer, MockServer } from './mock-http.js'

export async function createGitHubMock(): Promise<MockServer> {
  return createMockServer([
    { method: 'GET', path: '/user', handler: () => ({ headers: { 'x-oauth-scopes': 'read:user, repo' }, body: { id: 1, login: 'octocat' } }) },
  ])
}

export async function createGoogleMock(): Promise<MockServer> {
  return createMockServer([
    { method: 'GET', path: '/userinfo', handler: () => ({ body: { sub: '123', name: 'Alice', email: 'a@example.com', picture: 'http://x' } }) },
  ])
}

export async function createCustomOIDCMock(): Promise<MockServer> {
  return createMockServer([
    { method: 'POST', path: '/token', handler: () => ({ body: { access_token: 'AT', expires_in: 3600, scope: 'openid' } }) },
    { method: 'GET', path: '/userinfo', handler: () => ({ body: { sub: 'abc', name: 'Bob' } }) },
  ])
}

