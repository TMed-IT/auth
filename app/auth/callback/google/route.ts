import { exchangeCodeForToken, getGoogleUserInfo, verifyGoogleIdToken, generateJWT } from '@/app/api/_auth/auth'
import { deleteCookie, getTempCookieMaxAge, readCookie, setAuthCookie, setEncryptedTempCookie, validateAuthTokenMaxAge } from '@/app/api/_auth/token'
import { getServerEnv, requireEnv } from '@/lib/server/env'
import { trustedRedirectOrFallback } from '@/lib/server/url'
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

type EnvBasic = {
  AUTH_TRUSTED_ORIGINS?: string
  AUTH_URL?: string
  NEXTJS_ENV?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  AUTH_TOKEN_MAX_AGE?: number | string
  AUTH_EMAIL_ALLOW_REGEX?: string
  DB?: D1Database
}

export async function GET(req: NextRequest) {
  const env = getServerEnv<EnvBasic>()
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const storedState = readCookie(req, 'oauth_state')
  const storedNonce = readCookie(req, 'oauth_nonce')
  const storedVerifier = readCookie(req, 'pkce_verifier')
  const pendingRedirect = readCookie(req, 'oauth_redirect')

  const response = NextResponse.json(
    {},
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
  const cookies = response.cookies
  deleteCookie(cookies, 'oauth_state')
  deleteCookie(cookies, 'oauth_nonce')
  deleteCookie(cookies, 'pkce_verifier')
  deleteCookie(cookies, 'oauth_redirect')
  const errorResponse = (error: string, status: number) =>
    NextResponse.json({ error }, { status, headers: response.headers })

  if (!code || !state || !storedState || !storedNonce || !storedVerifier || state !== storedState) {
    return errorResponse('invalid_state', 400)
  }

  const authUrl = requireEnv(env.AUTH_URL, 'AUTH_URL')
  const googleClientId = requireEnv(env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID')
  const googleClientSecret = requireEnv(env.GOOGLE_CLIENT_SECRET, 'GOOGLE_CLIENT_SECRET')
  const authEmailAllowRegex = requireEnv(env.AUTH_EMAIL_ALLOW_REGEX, 'AUTH_EMAIL_ALLOW_REGEX')
  
  const redirectUri = `${authUrl}/auth/callback/google`
  const tokenData = await exchangeCodeForToken(code, String(googleClientId), String(googleClientSecret), redirectUri, storedVerifier)
  if (!tokenData) return errorResponse('token_exchange_failed', 400)

  const idPayload = await verifyGoogleIdToken(tokenData.idToken, String(googleClientId), storedNonce)
  if (!idPayload) return errorResponse('invalid_id_token', 401)

  const googleUser = await getGoogleUserInfo(tokenData.accessToken)
  if (!googleUser) return errorResponse('userinfo_failed', 400)
  if (idPayload.sub !== googleUser.id) return errorResponse('identity_mismatch', 401)
  if (idPayload.email && idPayload.email.toLowerCase() !== googleUser.email.toLowerCase()) {
    return errorResponse('identity_mismatch', 401)
  }
  if (googleUser.emailVerified !== true) return errorResponse('email_not_verified', 403)

  if (!validateEmailRegex(googleUser.email, String(authEmailAllowRegex))) {
    return errorResponse('email_not_allowed', 403)
  }

  const db = env.DB as D1Database
  type UserRow = { id: string; email: string; given_name: string; family_name: string; avatar: string | null }
  
  try {
    const existing = await db.prepare('SELECT * FROM users WHERE email = ?').bind(googleUser.email).first<UserRow>()
    if (!existing) {
      const tmp = {
        email: googleUser.email,
        given_name: googleUser.given_name || '',
        family_name: googleUser.family_name || '',
        avatar: googleUser.picture || '',
        redirect: pendingRedirect || '',
      }
      await setEncryptedTempCookie(cookies, 'pending_user', JSON.stringify(tmp), getTempCookieMaxAge())
      const consentUrl = `${authUrl}/consent`
      return NextResponse.redirect(consentUrl, { status: 302, headers: response.headers })
    }

    const avatarUrl = googleUser.picture || null
    if (avatarUrl && avatarUrl !== existing.avatar) {
      await db.prepare('UPDATE users SET avatar = ? WHERE id = ?').bind(avatarUrl, existing.id).run()
    }

    const authTokenMaxAge = validateAuthTokenMaxAge(env.AUTH_TOKEN_MAX_AGE, 'AUTH_TOKEN_MAX_AGE')
    const name = `${existing.family_name} ${existing.given_name}`
    const avatar = avatarUrl || existing.avatar || undefined
    const jwt = await generateJWT({ id: existing.id, email: existing.email, name, avatar }, authTokenMaxAge)
    setAuthCookie(cookies, jwt)
    const location = trustedRedirectOrFallback(pendingRedirect, env)
    return NextResponse.redirect(location, { status: 302, headers: response.headers })
  } catch (dbError) {
    console.error('Database error:', dbError)
    deleteCookie(cookies, 'pending_user')
    return errorResponse('database_error', 500)
  }
}
