export function makeToken(overrides?: Partial<{ access_token: string; expires_in: number; scope: string | string[] }>) {
  const scope = overrides?.scope ?? ['openid']
  return {
    access_token: overrides?.access_token ?? `at_${Math.random().toString(36).slice(2)}`,
    token_type: 'bearer',
    expires_in: overrides?.expires_in ?? 3600,
    scope: Array.isArray(scope) ? scope.join(' ') : scope,
  }
}

