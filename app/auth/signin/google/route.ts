import { createGoogleAuthUrl, generateCodeChallenge, generateCodeVerifier, generateNonce, generateState } from '@/app/api/_auth/auth'
import { getTempCookieMaxAge, setTempCookie } from '@/app/api/_auth/token'
import { getServerEnv, requireEnv } from '@/lib/server/env'
import { sameDomainRedirectOrNull } from '@/lib/server/url'
import { NextRequest, NextResponse } from 'next/server'

type SigninEnv = { AUTH_URL?: string; GOOGLE_CLIENT_ID?: string; AUTH_COOKIE_DOMAIN?: string }

export async function POST(req: NextRequest) {
  const env = getServerEnv<SigninEnv>()
  type SigninBody = { redirect?: string }
  const body = (await req.json().catch(() => ({} as SigninBody))) as SigninBody
  const requestedRedirect = typeof body.redirect === 'string' ? body.redirect : null
  const redirect = sameDomainRedirectOrNull(requestedRedirect, env)

  const authUrl = requireEnv(env.AUTH_URL, 'AUTH_URL')
  const googleClientId = requireEnv(env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID')
  
  const state = generateState()
  const nonce = generateNonce()
  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  const redirectUri = `${authUrl}/auth/callback/google`

  const response = NextResponse.json({ authUrl: '' })
  const cookies = response.cookies
  const tempCookieMaxAge = getTempCookieMaxAge()
  setTempCookie(cookies, 'oauth_state', state, tempCookieMaxAge)
  setTempCookie(cookies, 'oauth_nonce', nonce, tempCookieMaxAge)
  setTempCookie(cookies, 'pkce_verifier', verifier, tempCookieMaxAge)
  if (redirect) setTempCookie(cookies, 'oauth_redirect', redirect, tempCookieMaxAge)

  const authUrlForGoogle = createGoogleAuthUrl(String(googleClientId), redirectUri, state, challenge, nonce)
  return NextResponse.json({ authUrl: authUrlForGoogle }, { headers: response.headers })
}

