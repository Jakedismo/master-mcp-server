declare module 'jose' {
  export function createRemoteJWKSet(url: URL): any
  export function jwtVerify(
    jwt: string,
    key: any,
    options?: { issuer?: string | string[]; audience?: string | string[] }
  ): Promise<{ payload: any; protectedHeader: any }>
  export function decodeJwt(jwt: string): any
}

