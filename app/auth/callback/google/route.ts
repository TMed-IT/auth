import { exchangeCodeForToken, getGoogleUserInfo, verifyGoogleIdToken, generateJWT } from '@/app/api/_auth/auth'
import { deleteCookie, getTempCookieMaxAge, readCookie, setAuthCookie, setEncryptedTempCookie, validateAuthTokenMaxAge } from '@/app/api/_auth/token'
import { getServerEnv, requireEnv } from '@/lib/server/env'
import { sameDomainRedirectOrFallback } from '@/lib/server/url'
import type { D1Database } from '@/lib/server/d1'
import { NextRequest, NextResponse } from 'next/server'

const validateEmailRegex = (email: string, pattern: string) => {
  try {
    const r = new RegExp(pattern)
    return r.test(email)
  } catch {
    return false
  }
}

type EnvBasic = { FRONTEND_URL?: string; AUTH_COOKIE_DOMAIN?: string; AUTH_URL?: string; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; AUTH_TOKEN_MAX_AGE?: number | string; AUTH_EMAIL_ALLOW_REGEX?: string; DB?: D1Database }

export async function GET(req: NextRequest) {
  const env = getServerEnv<EnvBasic>()
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const storedState = readCookie(req, 'oauth_state')
  const storedNonce = readCookie(req, 'oauth_nonce')
  const storedVerifier = readCookie(req, 'pkce_verifier')
  const pendingRedirect = readCookie(req, 'oauth_redirect')

  const response = NextResponse.redirect(new URL('/', req.url), { status: 302 })
  const cookies = response.cookies
  deleteCookie(cookies, 'oauth_state')
  deleteCookie(cookies, 'oauth_nonce')
  deleteCookie(cookies, 'pkce_verifier')
  deleteCookie(cookies, 'oauth_redirect')

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.json({ error: 'invalid_state' }, { status: 400 })
  }

  const authUrl = requireEnv(env.AUTH_URL, 'AUTH_URL')
  const googleClientId = requireEnv(env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID')
  const googleClientSecret = requireEnv(env.GOOGLE_CLIENT_SECRET, 'GOOGLE_CLIENT_SECRET')
  const authEmailAllowRegex = requireEnv(env.AUTH_EMAIL_ALLOW_REGEX, 'AUTH_EMAIL_ALLOW_REGEX')
  
  const redirectUri = `${authUrl}/auth/callback/google`
  const tokenData = await exchangeCodeForToken(code, String(googleClientId), String(googleClientSecret), redirectUri, storedVerifier || '')
  if (!tokenData) return NextResponse.json({ error: 'token_exchange_failed' }, { status: 400 })

  if (tokenData.idToken) {
    const ok = await verifyGoogleIdToken(tokenData.idToken, String(googleClientId), storedNonce || undefined)
    if (!ok) return NextResponse.json({ error: 'invalid_id_token' }, { status: 401 })
  }

  const googleUser = await getGoogleUserInfo(tokenData.accessToken)
  if (!googleUser) return NextResponse.json({ error: 'userinfo_failed' }, { status: 400 })
  if (googleUser.emailVerified === false) return NextResponse.json({ error: 'email_not_verified' }, { status: 403 })

  if (!validateEmailRegex(googleUser.email, String(authEmailAllowRegex))) {
    return NextResponse.json({ error: 'email_not_allowed' }, { status: 403 })
  }

  const db = env.DB as D1Database
  type UserRow = { id: string; email: string; given_name: string; family_name: string }
  
  try {
    const existing = await db.prepare('SELECT * FROM users WHERE email = ?').bind(googleUser.email).first<UserRow>()
    if (!existing) {
      const tmp = {
        email: googleUser.email,
        given_name: googleUser.given_name || '',
        family_name: googleUser.family_name || '',
        picture: googleUser.picture || '',
        redirect: pendingRedirect || '',
      }
      await setEncryptedTempCookie(cookies, 'pending_user', JSON.stringify(tmp), getTempCookieMaxAge())
      const consentUrl = `${authUrl}/consent`
      return NextResponse.redirect(consentUrl, { status: 302, headers: response.headers })
    }

    const authTokenMaxAge = validateAuthTokenMaxAge(env.AUTH_TOKEN_MAX_AGE, 'AUTH_TOKEN_MAX_AGE')
    const frontendUrl = requireEnv(env.FRONTEND_URL, 'FRONTEND_URL')
    
    const name = `${existing.family_name} ${existing.given_name}`
    const jwt = await generateJWT({ id: existing.id, email: existing.email, name, picture: googleUser.picture }, authTokenMaxAge)
    setAuthCookie(cookies, jwt)
    const location = sameDomainRedirectOrFallback(pendingRedirect, frontendUrl, env)
    return NextResponse.redirect(location, { status: 302, headers: response.headers })
  } catch (dbError) {
    console.error('Database error:', dbError)
    deleteCookie(cookies, 'pending_user')
    return NextResponse.json({ error: 'database_error' }, { status: 500 })
  }
}
