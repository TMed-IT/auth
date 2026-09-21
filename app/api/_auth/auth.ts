export type AuthUser = {
  id: string
  email: string
  name: string
  picture?: string
  emailVerified?: boolean
  given_name?: string
  family_name?: string
}

const b64uEncode = (data: ArrayBuffer | Uint8Array) => {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let str = ''
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i])
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const b64uDecodeToBytes = (s: string) => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export const generateState = () => crypto.getRandomValues(new Uint8Array(32)).reduce((p, c) => p + c.toString(16).padStart(2, '0'), '')
export const generateNonce = () => crypto.getRandomValues(new Uint8Array(32)).reduce((p, c) => p + c.toString(16).padStart(2, '0'), '')
export const generateCodeVerifier = () => b64uEncode(crypto.getRandomValues(new Uint8Array(32)))
export const generateCodeChallenge = async (verifier: string) => {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return b64uEncode(digest)
}

export const createGoogleAuthUrl = (
  clientId: string,
  redirectUri: string,
  state: string,
  codeChallenge: string,
  nonce: string,
) => {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', 'openid email profile')
  u.searchParams.set('state', state)
  u.searchParams.set('code_challenge', codeChallenge)
  u.searchParams.set('code_challenge_method', 'S256')
  u.searchParams.set('nonce', nonce)
  return u.toString()
}

type GoogleTokenResponse = {
  access_token?: string
  id_token?: string
}

export const exchangeCodeForToken = async (
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{ accessToken: string; idToken: string } | null> => {
  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('code', code)
  body.set('client_id', clientId)
  body.set('client_secret', clientSecret)
  body.set('redirect_uri', redirectUri)
  body.set('code_verifier', codeVerifier)
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (!r?.ok) return null
  const j = (await r.json().catch(() => null)) as GoogleTokenResponse | null
  if (!j || typeof j.access_token !== 'string' || typeof j.id_token !== 'string') return null
  return { accessToken: j.access_token, idToken: j.id_token }
}

let jwksCache: { exp: number; keys: Record<string, CryptoKey> } | null = null

const importJwk = async (jwk: JsonWebKey) => {
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
}

const getGoogleJwks = async () => {
  const now = Date.now()
  if (jwksCache && jwksCache.exp > now) return jwksCache.keys
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs', {
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (!r?.ok) throw new Error('jwks')
  const jj = (await r.json()) as { keys?: (JsonWebKey & { kid?: string })[] }
  const keys = jj.keys ?? []
  const map: Record<string, CryptoKey> = {}
  for (const k of keys) {
    const key = await importJwk(k)
    if (k.kid) map[k.kid] = key
  }
  jwksCache = { exp: now + 60_000, keys: map }
  return map
}

type GoogleIdPayload = {
  iss: string
  aud: string
  exp: number
  sub: string
  email?: string
  nonce: string
  [k: string]: unknown
}

export const verifyGoogleIdToken = async (
  idToken: string,
  clientId: string,
  expectedNonce: string,
): Promise<GoogleIdPayload | null> => {
  try {
    const parts = idToken.split('.')
    if (parts.length !== 3) return null
    const header = JSON.parse(new TextDecoder().decode(b64uDecodeToBytes(parts[0]))) as { alg?: string; kid?: string }
    const payload = JSON.parse(new TextDecoder().decode(b64uDecodeToBytes(parts[1]))) as GoogleIdPayload
    if (header.alg !== 'RS256') return null
    const keys = await getGoogleJwks()
    const kid = header.kid ?? ''
    const key = kid ? keys[kid] : undefined
    if (!key) return null
    const data = new TextEncoder().encode(parts[0] + '.' + parts[1])
    const sig = b64uDecodeToBytes(parts[2])
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data)
    if (!ok) return null
    const issOk = payload.iss === 'https://accounts.google.com' || payload.iss === 'accounts.google.com'
    if (!issOk) return null
    if (payload.aud !== clientId) return null
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null
    if (typeof payload.sub !== 'string' || !payload.sub) return null
    if (payload.nonce !== expectedNonce) return null
    return payload
  } catch {
    return null
  }
}

type GoogleUserInfoResponse = {
  id: string
  email: string
  verified_email?: boolean
  email_verified?: boolean
  name?: string
  given_name?: string
  family_name?: string
  picture?: string
}

export const getGoogleUserInfo = async (accessToken: string): Promise<AuthUser | null> => {
  const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (!r?.ok) return null
  const j = (await r.json().catch(() => null)) as GoogleUserInfoResponse | null
  if (!j || typeof j.id !== 'string' || !j.id || typeof j.email !== 'string' || !j.email) return null
  const u: AuthUser = {
    id: j.id,
    email: j.email,
    name: j.name ?? '',
    picture: j.picture,
    emailVerified: j.verified_email ?? j.email_verified,
    given_name: j.given_name,
    family_name: j.family_name,
  }
  return u
}
