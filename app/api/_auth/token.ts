import * as Iron from 'iron-webcrypto'
import { getServerEnv, requireEnv } from '@/lib/server/env'
import { ResponseCookies } from 'next/dist/server/web/spec-extension/cookies'

type IronCrypto = {
  readonly subtle: {
    decrypt: (algorithm: AesCbcParams | AesCtrParams | AesGcmParams | AlgorithmIdentifier | RsaOaepParams, key: CryptoKey, data: Uint8Array) => Promise<ArrayBuffer>
    deriveBits: (algorithm: AlgorithmIdentifier | EcdhKeyDeriveParams | HkdfParams | Pbkdf2Params, baseKey: CryptoKey, length: number) => Promise<ArrayBuffer>
    encrypt: (algorithm: AesCbcParams | AesCtrParams | AesGcmParams | AlgorithmIdentifier | RsaOaepParams, key: CryptoKey, data: Uint8Array) => Promise<ArrayBuffer>
    importKey: (format: Exclude<KeyFormat, 'jwk'>, keyData: ArrayBuffer | Uint8Array, algorithm: AesKeyAlgorithm | AlgorithmIdentifier | EcKeyImportParams | HmacImportParams | RsaHashedImportParams, extractable: boolean, keyUsages: KeyUsage[]) => Promise<CryptoKey>
    sign: (algorithm: AlgorithmIdentifier | EcdsaParams | RsaPssParams, key: CryptoKey, data: Uint8Array) => Promise<ArrayBuffer>
  }
  getRandomValues: (array: Uint8Array) => Uint8Array
}

type EnvShape = {
  AUTH_COOKIE_DOMAIN?: string
  AUTH_TOKEN_MAX_AGE?: number | string
  AUTH_URL?: string
  NODE_ENV?: string
  TEMP_COOKIE_MAX_AGE?: number | string
}

const getEnv = (): EnvShape => {
  if (typeof process === 'undefined' || !process.env) {
    throw new Error('process.env is not available')
  }
  const g = globalThis as unknown as { env?: EnvShape }
  const nodeEnv = process.env as EnvShape
  return { ...nodeEnv, ...(g.env ?? {}) }
}

export const validateAuthTokenMaxAge = (value: number | string | undefined, name: string): number => {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Environment variable ${name} is not set`)
  }
  const numValue = Number(value)
  if (!Number.isFinite(numValue) || numValue <= 0) {
    throw new Error(`Environment variable ${name} must be a positive finite number. Current value: ${value}`)
  }
  return numValue
}

const getCookieOptions = () => {
  const env = getEnv()
  const nodeEnv = env.NODE_ENV || process.env.NODE_ENV || 'development'
  const isProduction = nodeEnv === 'production'
  
  let domain: string | undefined = undefined
  if (isProduction) {
    domain = requireEnv(env.AUTH_COOKIE_DOMAIN, 'AUTH_COOKIE_DOMAIN')
  } else {
    const authUrl = env.AUTH_URL || process.env.AUTH_URL
    if (authUrl && (authUrl.includes('localhost') || authUrl.includes('127.0.0.1'))) {
      domain = undefined
    } else {
      domain = env.AUTH_COOKIE_DOMAIN || undefined
    }
  }
  
  const maxAge = validateAuthTokenMaxAge(env.AUTH_TOKEN_MAX_AGE, 'AUTH_TOKEN_MAX_AGE')
  const secure = isProduction
  return { domain, maxAge, secure }
}

export const setAuthCookie = (cookies: ResponseCookies, token: string) => {
  const { domain, maxAge, secure } = getCookieOptions()
  cookies.set('auth_token', token, {
    path: '/',
    domain: domain || undefined,
    maxAge,
    httpOnly: true,
    secure,
    sameSite: 'lax',
  })
}

export const deleteAuthCookie = (cookies: ResponseCookies) => {
  const { domain, secure } = getCookieOptions()
  cookies.set('auth_token', '', {
    path: '/',
    domain: domain || undefined,
    maxAge: 0,
    httpOnly: true,
    secure,
    sameSite: 'lax',
  })
}

export const getAuthCookie = (req: Request) => {
  const cookie = req.headers.get('cookie') || ''
  const m = cookie.split(/;\s*/).find((p) => p.startsWith('auth_token='))
  if (!m) return null
  return decodeURIComponent(m.split('=').slice(1).join('='))
}

export const setTempCookie = (cookies: ResponseCookies, name: string, value: string, maxAgeSec: number) => {
  const { domain, secure } = getCookieOptions()
  cookies.set(name, encodeURIComponent(value), {
    path: '/',
    domain: domain || undefined,
    maxAge: maxAgeSec,
    httpOnly: true,
    secure,
    sameSite: 'lax',
  })
}

export const readCookie = (req: Request, name: string) => {
  const cookie = req.headers.get('cookie') || ''
  const m = cookie.split(/;\s*/).find((p) => p.startsWith(name + '='))
  if (!m) return null
  return decodeURIComponent(m.split('=').slice(1).join('='))
}

export const deleteCookie = (cookies: ResponseCookies, name: string) => {
  const { domain, secure } = getCookieOptions()
  cookies.set(name, '', {
    path: '/',
    domain: domain || undefined,
    maxAge: 0,
    httpOnly: true,
    secure,
    sameSite: 'lax',
  })
}

export const getTempCookieMaxAge = (): number => {
  const env = getEnv()
  const tempCookieMaxAge = env.TEMP_COOKIE_MAX_AGE
  if (tempCookieMaxAge !== undefined && tempCookieMaxAge !== null && tempCookieMaxAge !== '') {
    const numValue = Number(tempCookieMaxAge)
    if (Number.isFinite(numValue) && numValue > 0) {
      return numValue
    }
  }
  return 180
}

export const setEncryptedTempCookie = async (cookies: ResponseCookies, name: string, value: string, maxAgeSec: number) => {
  const env = getServerEnv<{ ENCRYPTION_SECRET?: string }>()
  const secret = requireEnv(env.ENCRYPTION_SECRET, 'ENCRYPTION_SECRET')
  
  const options = Iron.clone(Iron.defaults)
  options.ttl = maxAgeSec * 1000
  
  const encrypted = await Iron.seal(globalThis.crypto as unknown as IronCrypto, value, secret, options)
  setTempCookie(cookies, name, encrypted, maxAgeSec)
}

export const readEncryptedCookie = async (req: Request, name: string): Promise<string | null> => {
  const env = getServerEnv<{ ENCRYPTION_SECRET?: string }>()
  const secret = requireEnv(env.ENCRYPTION_SECRET, 'ENCRYPTION_SECRET')
  
  const encrypted = readCookie(req, name)
  if (!encrypted) return null
  
  const options = Iron.clone(Iron.defaults)
  options.ttl = getTempCookieMaxAge() * 1000
  
  try {
    const result = await Iron.unseal(globalThis.crypto as unknown as IronCrypto, encrypted, secret, options)
    return typeof result === 'string' ? result : null
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes('expired') || errorMessage.includes('ttl')) {
      return null
    }
    return null
  }
}

export const generateCsrfToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

const computeSessionBinding = async (sessionData: string): Promise<string> => {
  const data = new TextEncoder().encode(sessionData)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hash))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32)
}

export const generateCsrfTokenWithBinding = async (sessionBinding: string): Promise<string> => {
  const randomToken = generateCsrfToken()
  const binding = await computeSessionBinding(sessionBinding)
  return `${randomToken}:${binding}`
}

export const setCsrfTokenCookie = async (cookies: ResponseCookies, token: string, sessionBinding?: string): Promise<string> => {
  const env = getServerEnv<{ CSRF_SECRET?: string }>()
  const secret = requireEnv(env.CSRF_SECRET, 'CSRF_SECRET')
  const { domain, maxAge, secure } = getCookieOptions()
  
  let tokenToEncrypt = token
  if (sessionBinding) {
    const binding = await computeSessionBinding(sessionBinding)
    tokenToEncrypt = `${token}:${binding}`
  }
  
  const options = Iron.clone(Iron.defaults)
  options.ttl = maxAge * 1000
  
  const encrypted = await Iron.seal(globalThis.crypto as unknown as IronCrypto, tokenToEncrypt, secret, options)
  cookies.set('csrf_token', encrypted, {
    path: '/',
    domain: domain || undefined,
    maxAge,
    httpOnly: true,
    secure,
    sameSite: 'lax',
  })
  return encrypted
}

export const getEncryptedCsrfTokenFromCookie = (req: Request): string | null => {
  return readCookie(req, 'csrf_token')
}

export const getCsrfTokenFromCookie = async (req: Request): Promise<string | null> => {
  const env = getServerEnv<{ CSRF_SECRET?: string }>()
  const secret = requireEnv(env.CSRF_SECRET, 'CSRF_SECRET')
  
  const encrypted = readCookie(req, 'csrf_token')
  if (!encrypted) return null
  
  const { maxAge } = getCookieOptions()
  const options = Iron.clone(Iron.defaults)
  options.ttl = maxAge * 1000
  
  try {
    const result = await Iron.unseal(globalThis.crypto as unknown as IronCrypto, encrypted, secret, options)
    return typeof result === 'string' ? result : null
  } catch {
    return null
  }
}

export const verifyCsrfToken = async (req: Request, encryptedTokenFromRequest: string | null, expectedSessionBinding?: string): Promise<boolean> => {
  if (!encryptedTokenFromRequest) return false
  
  const env = getServerEnv<{ CSRF_SECRET?: string }>()
  const secret = requireEnv(env.CSRF_SECRET, 'CSRF_SECRET')
  
  const encryptedTokenFromCookie = readCookie(req, 'csrf_token')
  if (!encryptedTokenFromCookie) return false
  
  if (encryptedTokenFromCookie !== encryptedTokenFromRequest) return false
  
  const { maxAge } = getCookieOptions()
  const options = Iron.clone(Iron.defaults)
  options.ttl = maxAge * 1000
  
  try {
    const tokenFromCookie = await Iron.unseal(globalThis.crypto as unknown as IronCrypto, encryptedTokenFromCookie, secret, options)
    const tokenFromRequest = await Iron.unseal(globalThis.crypto as unknown as IronCrypto, encryptedTokenFromRequest, secret, options)
    
    if (typeof tokenFromCookie !== 'string' || typeof tokenFromRequest !== 'string') return false
    if (tokenFromCookie !== tokenFromRequest) return false
    
    if (expectedSessionBinding) {
      const parts = tokenFromCookie.split(':')
      if (parts.length !== 2) return false
      const expectedBinding = await computeSessionBinding(expectedSessionBinding)
      if (parts[1] !== expectedBinding) return false
    }
    
    return true
  } catch {
    return false
  }
}

export const verifyCsrfTokenFromCookie = async (req: Request, expectedSessionBinding?: string): Promise<boolean> => {
  const env = getServerEnv<{ CSRF_SECRET?: string }>()
  const secret = requireEnv(env.CSRF_SECRET, 'CSRF_SECRET')
  
  const encryptedTokenFromCookie = readCookie(req, 'csrf_token')
  if (!encryptedTokenFromCookie) return false
  
  const { maxAge } = getCookieOptions()
  const options = Iron.clone(Iron.defaults)
  options.ttl = maxAge * 1000
  
  try {
    const tokenFromCookie = await Iron.unseal(globalThis.crypto as unknown as IronCrypto, encryptedTokenFromCookie, secret, options)
    
    if (typeof tokenFromCookie !== 'string') return false
    
    if (expectedSessionBinding) {
      const parts = tokenFromCookie.split(':')
      if (parts.length !== 2) return false
      const expectedBinding = await computeSessionBinding(expectedSessionBinding)
      if (parts[1] !== expectedBinding) return false
    }
    
    return true
  } catch {
    return false
  }
}

export const verifyOrigin = (req: Request, allowedOrigins: string[]): boolean => {
  const origin = req.headers.get('origin')
  if (!origin) {
    const referer = req.headers.get('referer')
    if (!referer) return false
    try {
      const refererUrl = new URL(referer)
      return allowedOrigins.some(allowed => {
        try {
          const allowedUrl = new URL(allowed)
          return refererUrl.origin === allowedUrl.origin
        } catch {
          return false
        }
      })
    } catch {
      return false
    }
  }
  
  return allowedOrigins.some(allowed => {
    try {
      const originUrl = new URL(origin)
      const allowedUrl = new URL(allowed)
      return originUrl.origin === allowedUrl.origin
    } catch {
      return false
    }
  })
}

try {
  const env = getEnv()
  if (env.AUTH_TOKEN_MAX_AGE !== undefined && env.AUTH_TOKEN_MAX_AGE !== null && env.AUTH_TOKEN_MAX_AGE !== '') {
    validateAuthTokenMaxAge(env.AUTH_TOKEN_MAX_AGE, 'AUTH_TOKEN_MAX_AGE')
  }
} catch (error) {
  if (error instanceof Error) {
    throw new Error(`Startup validation error: ${error.message}`)
  }
  throw error
}

