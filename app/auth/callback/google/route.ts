import { exchangeCodeForToken, getGoogleUserInfo, verifyGoogleIdToken } from '@/app/api/_auth/auth'
import { deleteCookie, getTempCookieMaxAge, readCookie, setEncryptedTempCookie, setSessionCookie, validateSessionMaxAge } from '@/app/api/_auth/token'
import { getServerEnv, requireEnv } from '@/lib/server/env'
import { trustedAuthFlowRedirectOrFallback } from '@/lib/server/url'
import type { D1Database } from '@/lib/server/d1'
import { NextRequest, NextResponse } from 'next/server'
import siteConfig from '@site-config'
import { decideUserAccess } from '@/lib/auth-policy'
import { createSession } from '@/lib/server/sessions'
import { validateGoogleOAuthCallback } from '@/lib/google-oauth-callback'
import type { ErrorCode } from '@/config/site'
import { normalizeAvatarPath } from '@/lib/avatar'
import { copyGoogleAvatarToR2 } from '@/lib/server/avatars'

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
  SESSION_MAX_AGE?: number | string
  AUTH_EMAIL_ALLOW_REGEX?: string
  DB?: D1Database
  AVATARS?: CloudflareEnv['AVATARS']
}

export async function GET(req: NextRequest) {
  const env = getServerEnv<EnvBasic>()
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const providerError = url.searchParams.get('error')
  const storedState = readCookie(req, 'oauth_state')
  const storedNonce = readCookie(req, 'oauth_nonce')
  const storedVerifier = readCookie(req, 'pkce_verifier')
  const pendingRedirect = readCookie(req, 'oauth_redirect')

  const response = new NextResponse(null, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
  const cookies = response.cookies
  deleteCookie(cookies, 'oauth_state')
  deleteCookie(cookies, 'oauth_nonce')
  deleteCookie(cookies, 'pkce_verifier')
  deleteCookie(cookies, 'oauth_redirect')
  const authUrl = requireEnv(env.AUTH_URL, 'AUTH_URL')
  const errorResponse = (error: ErrorCode) => {
    const errorUrl = new URL('/error', authUrl)
    errorUrl.searchParams.set('key', 'oauth_error')
    errorUrl.searchParams.set('code', error)
    return NextResponse.redirect(errorUrl, { status: 302, headers: response.headers })
  }

  const callback = validateGoogleOAuthCallback({
    code,
    state,
    providerError,
    storedState,
    storedNonce,
    storedVerifier,
  })
  if (!callback.ok) {
    return errorResponse(callback.error)
  }

  const googleClientId = requireEnv(env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID')
  const googleClientSecret = requireEnv(env.GOOGLE_CLIENT_SECRET, 'GOOGLE_CLIENT_SECRET')

  const redirectUri = `${authUrl}/auth/callback/google`
  const tokenData = await exchangeCodeForToken(callback.code, String(googleClientId), String(googleClientSecret), redirectUri, callback.verifier)
  if (!tokenData) return errorResponse('token_exchange_failed')

  const idPayload = await verifyGoogleIdToken(tokenData.idToken, String(googleClientId), callback.nonce)
  if (!idPayload) return errorResponse('invalid_id_token')

  const googleUser = await getGoogleUserInfo(tokenData.accessToken)
  if (!googleUser) return errorResponse('userinfo_failed')
  if (idPayload.sub !== googleUser.id) return errorResponse('identity_mismatch')
  if (idPayload.email && idPayload.email.toLowerCase() !== googleUser.email.toLowerCase()) {
    return errorResponse('identity_mismatch')
  }
  if (googleUser.emailVerified !== true) return errorResponse('email_not_verified')

  if (siteConfig.auth.allowSelfRegistration) {
    const authEmailAllowRegex = requireEnv(env.AUTH_EMAIL_ALLOW_REGEX, 'AUTH_EMAIL_ALLOW_REGEX')
    if (!validateEmailRegex(googleUser.email, String(authEmailAllowRegex))) {
      return errorResponse('email_not_allowed')
    }
  }

  const avatarBucket = env.AVATARS
  if (!avatarBucket) return errorResponse('server_configuration_error')

  const db = env.DB as D1Database
  type UserRow = {
    id: string | null
    email: string
    given_name: string | null
    family_name: string | null
    avatar: string | null
    consented_at: string | null
  }
  
  try {
    const userQuery =
      'SELECT id, email, given_name, family_name, avatar, consented_at FROM users WHERE email = ?'
    const existing = await db.prepare(userQuery).bind(googleUser.email).first<UserRow>()

    const accessDecision = decideUserAccess(existing, siteConfig.auth.allowSelfRegistration)
    if (accessDecision === 'reject') {
      return errorResponse('email_not_allowlisted')
    }

    let avatarPath = normalizeAvatarPath(existing?.avatar)
    try {
      avatarPath = await copyGoogleAvatarToR2(
        avatarBucket,
        googleUser.email,
        googleUser.picture,
      ) ?? avatarPath
    } catch (error) {
      console.error(JSON.stringify({
        event: 'avatar_sync_failed',
        error: error instanceof Error ? error.message : String(error),
      }))
    }

    if (accessDecision === 'consent') {
      const tmp = {
        email: googleUser.email,
        given_name: googleUser.given_name || '',
        family_name: googleUser.family_name || '',
        display_name: googleUser.name || '',
        avatar: avatarPath || '',
        redirect: pendingRedirect || '',
      }
      await setEncryptedTempCookie(cookies, 'pending_user', JSON.stringify(tmp), getTempCookieMaxAge())
      const consentUrl = `${authUrl}/consent`
      return NextResponse.redirect(consentUrl, { status: 302, headers: response.headers })
    }

    if (!existing?.id) return errorResponse('database_error')

    if (avatarPath !== existing.avatar) {
      await db.prepare('UPDATE users SET avatar = ? WHERE id = ?').bind(avatarPath, existing.id).run()
    }

    const maxAge = validateSessionMaxAge(env.SESSION_MAX_AGE)
    const sessionId = await createSession(db, existing.id, maxAge)
    setSessionCookie(cookies, sessionId)
    const location = trustedAuthFlowRedirectOrFallback(pendingRedirect, env)
    return NextResponse.redirect(location, { status: 302, headers: response.headers })
  } catch (dbError) {
    console.error('Database error:', dbError)
    deleteCookie(cookies, 'pending_user')
    return errorResponse('database_error')
  }
}
