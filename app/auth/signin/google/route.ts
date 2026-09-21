import { createGoogleAuthUrl, generateCodeChallenge, generateCodeVerifier, generateNonce, generateState } from '@/app/api/_auth/auth'
import { getTempCookieMaxAge, setTempCookie, verifyOrigin } from '@/app/api/_auth/token'
import { applyCredentialedCors, createCorsPreflightResponse } from '@/lib/server/cors'
import { getServerEnv, requireEnv } from '@/lib/server/env'
import { getAllowedAuthOrigins, trustedAuthFlowRedirectOrNull } from '@/lib/server/url'
import { NextRequest, NextResponse } from 'next/server'

type SigninEnv = {
  AUTH_URL?: string
  AUTH_TRUSTED_ORIGINS?: string
  NEXTJS_ENV?: string
  GOOGLE_CLIENT_ID?: string
}

export async function POST(req: NextRequest) {
  const env = getServerEnv<SigninEnv>()
  const allowedOrigins = getAllowedAuthOrigins(env, req)
  if (!verifyOrigin(req, allowedOrigins)) {
    return applyCredentialedCors(
      NextResponse.json(
        { error: 'invalid_origin' },
        { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
      ),
      req,
      allowedOrigins,
    )
  }

  type SigninBody = { redirect?: string }
  const body = (await req.json().catch(() => ({} as SigninBody))) as SigninBody
  const redirectCandidates = [
    typeof body.redirect === 'string' ? body.redirect : null,
    req.headers.get('referer'),
    req.headers.get('origin'),
  ]
  const redirect =
    redirectCandidates
      .map((candidate) => trustedAuthFlowRedirectOrNull(candidate, env))
      .find((candidate): candidate is string => candidate !== null) ?? null

  const authUrl = requireEnv(env.AUTH_URL, 'AUTH_URL')
  const googleClientId = requireEnv(env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID')
  
  const state = generateState()
  const nonce = generateNonce()
  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  const redirectUri = `${authUrl}/auth/callback/google`

  const authUrlForGoogle = createGoogleAuthUrl(String(googleClientId), redirectUri, state, challenge, nonce)
  const response = NextResponse.json(
    { authUrl: authUrlForGoogle },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
  const cookies = response.cookies
  const tempCookieMaxAge = getTempCookieMaxAge()
  setTempCookie(cookies, 'oauth_state', state, tempCookieMaxAge)
  setTempCookie(cookies, 'oauth_nonce', nonce, tempCookieMaxAge)
  setTempCookie(cookies, 'pkce_verifier', verifier, tempCookieMaxAge)
  if (redirect) setTempCookie(cookies, 'oauth_redirect', redirect, tempCookieMaxAge)

  return applyCredentialedCors(response, req, allowedOrigins)
}

export async function OPTIONS(req: NextRequest) {
  const env = getServerEnv<SigninEnv>()
  return createCorsPreflightResponse(req, getAllowedAuthOrigins(env, req))
}
