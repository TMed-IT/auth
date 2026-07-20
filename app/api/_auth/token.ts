import * as Iron from 'iron-webcrypto'
import { getServerEnv, requireSecret } from '@/lib/server/env'
import { getAuthBaseDomain } from '@/lib/server/url'
import { ResponseCookies } from 'next/dist/server/web/spec-extension/cookies'

type EnvShape = {
  AUTH_URL?: string
  NEXTJS_ENV?: string
  AUTH_TOKEN_MAX_AGE?: number | string
  TEMP_COOKIE_MAX_AGE?: number | string
}

const HOST_COOKIE_PREFIX = '__Host-'
const hostCookieName = (name: string) => `${HOST_COOKIE_PREFIX}${name}`

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
  const maxAge = validateAuthTokenMaxAge(env.AUTH_TOKEN_MAX_AGE, 'AUTH_TOKEN_MAX_AGE')
  return { maxAge }
}

const getLegacyCookieDomain = () => {
  const baseDomain = getAuthBaseDomain(getEnv())
  return baseDomain ? `.${baseDomain}` : undefined
}

const deleteLegacyCookie = (cookies: ResponseCookies, name: string) => {
  cookies.set(name, '', {
    path: '/',
    domain: getLegacyCookieDomain(),
    maxAge: 0,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  })
}

export const deleteLegacyAuthCookie = (cookies: ResponseCookies) => {
  deleteLegacyCookie(cookies, 'auth_token')
}

export const setAuthCookie = (cookies: ResponseCookies, token: string) => {
  const { maxAge } = getCookieOptions()
  cookies.set(hostCookieName('auth_token'), token, {
    path: '/',
    maxAge,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  })
  deleteLegacyAuthCookie(cookies)
}

export const deleteAuthCookie = (cookies: ResponseCookies) => {
  cookies.set(hostCookieName('auth_token'), '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  })
  deleteLegacyAuthCookie(cookies)
}

export const getAuthCookie = (req: Request) => {
  const cookie = req.headers.get('cookie') || ''
  const cookiePrefix = `${hostCookieName('auth_token')}=`
  const m = cookie.split(/;\s*/).find((p) => p.startsWith(cookiePrefix))
  if (!m) return null
  return decodeURIComponent(m.split('=').slice(1).join('='))
}

export const setTempCookie = (cookies: ResponseCookies, name: string, value: string, maxAgeSec: number) => {
  cookies.set(hostCookieName(name), value, {
    path: '/',
    maxAge: maxAgeSec,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  })
  deleteLegacyCookie(cookies, name)
}

export const readCookie = (req: Request, name: string) => {
  const cookie = req.headers.get('cookie') || ''
  const m = cookie.split(/;\s*/).find((p) => p.startsWith(hostCookieName(name) + '='))
  if (!m) return null
  const raw = m.split('=').slice(1).join('=')
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export const deleteCookie = (cookies: ResponseCookies, name: string) => {
  cookies.set(hostCookieName(name), '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  })
  deleteLegacyCookie(cookies, name)
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
  const secret = requireSecret(env.ENCRYPTION_SECRET, 'ENCRYPTION_SECRET')
  
  const options = Iron.clone(Iron.defaults)
  options.ttl = maxAgeSec * 1000
  
  const encrypted = await Iron.seal(value, secret, options)
  setTempCookie(cookies, name, encrypted, maxAgeSec)
}

export const readEncryptedCookie = async (req: Request, name: string): Promise<string | null> => {
  const env = getServerEnv<{ ENCRYPTION_SECRET?: string }>()
  const secret = requireSecret(env.ENCRYPTION_SECRET, 'ENCRYPTION_SECRET')
  
  const encrypted = readCookie(req, name)
  if (!encrypted) return null
  
  const options = Iron.clone(Iron.defaults)
  options.ttl = getTempCookieMaxAge() * 1000
  
  try {
    const result = await Iron.unseal(encrypted, secret, options)
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

export const setCsrfTokenCookie = async (cookies: ResponseCookies, token: string, sessionBinding?: string): Promise<string> => {
  const env = getServerEnv<{ CSRF_SECRET?: string }>()
  const secret = requireSecret(env.CSRF_SECRET, 'CSRF_SECRET')
  const { maxAge } = getCookieOptions()
  
  let tokenToEncrypt = token
  if (sessionBinding) {
    const binding = await computeSessionBinding(sessionBinding)
    tokenToEncrypt = `${token}:${binding}`
  }
  
  const options = Iron.clone(Iron.defaults)
  options.ttl = maxAge * 1000
  
  const encrypted = await Iron.seal(tokenToEncrypt, secret, options)
  cookies.set(hostCookieName('csrf_token'), encrypted, {
    path: '/',
    maxAge,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  })
  deleteLegacyCookie(cookies, 'csrf_token')
  return encrypted
}

export const verifyCsrfToken = async (req: Request, encryptedTokenFromRequest: string | null, expectedSessionBinding?: string): Promise<boolean> => {
  if (!encryptedTokenFromRequest) return false
  
  const env = getServerEnv<{ CSRF_SECRET?: string }>()
  const secret = requireSecret(env.CSRF_SECRET, 'CSRF_SECRET')
  
  const encryptedTokenFromCookie = readCookie(req, 'csrf_token')
  if (!encryptedTokenFromCookie) return false
  
  if (encryptedTokenFromCookie !== encryptedTokenFromRequest) return false
  
  const { maxAge } = getCookieOptions()
  const options = Iron.clone(Iron.defaults)
  options.ttl = maxAge * 1000
  
  try {
    const tokenFromCookie = await Iron.unseal(encryptedTokenFromCookie, secret, options)
    const tokenFromRequest = await Iron.unseal(encryptedTokenFromRequest, secret, options)
    
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
