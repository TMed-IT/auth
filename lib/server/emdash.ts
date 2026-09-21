const encoder = new TextEncoder()

const encodeBase64Url = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export const isValidAuthorizationState = (value: string | null): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(value)

export const isValidCodeChallenge = (value: string | null): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)

export const isValidCodeVerifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9._~-]{43,128}$/.test(value)

export const generateAuthorizationCode = () =>
  encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)))

export const sha256Base64Url = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return encodeBase64Url(new Uint8Array(digest))
}

export const verifyCodeChallenge = async (verifier: string, expectedChallenge: string) =>
  (await sha256Base64Url(verifier)) === expectedChallenge
