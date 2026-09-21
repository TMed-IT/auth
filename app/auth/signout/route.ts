import { deleteSessionCookie, deleteCookie, deleteLegacyAuthCookie, generateCsrfToken, setCsrfTokenCookie, verifyCsrfToken, verifyOrigin } from '@/app/api/_auth/token'
import { getServerEnv } from '@/lib/server/env'
import { applyCredentialedCors, createCorsPreflightResponse } from '@/lib/server/cors'
import { getAllowedAuthOrigins, trustedRedirectOrFallback } from '@/lib/server/url'
import { NextRequest, NextResponse } from 'next/server'
import type { D1Database } from '@/lib/server/d1'
import { getSession, revokeSession } from '@/lib/server/sessions'

type SignoutEnv = {
  AUTH_URL?: string
  AUTH_DEFAULT_REDIRECT_URL?: string
  AUTH_TRUSTED_ORIGINS?: string
  NEXTJS_ENV?: string
  DB?: D1Database
}

const createSignoutResponse = (
  req: NextRequest,
  env: SignoutEnv,
  body: Record<string, unknown>,
  status = 200,
) => {
  const response = NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
  deleteLegacyAuthCookie(response.cookies)
  return applyCredentialedCors(response, req, getAllowedAuthOrigins(env, req))
}

const createSignoutRedirect = (location: string) => {
  const response = NextResponse.redirect(location, {
    status: 303,
    headers: { 'Cache-Control': 'private, no-store' },
  })
  deleteSessionCookie(response.cookies)
  deleteCookie(response.cookies, 'csrf_token')
  return response
}

export async function GET(req: NextRequest) {
  const env = getServerEnv<SignoutEnv>()
  if (!env.DB) return createSignoutResponse(req, env, { error: 'database_error' }, 500)

  let session: Awaited<ReturnType<typeof getSession>>
  try {
    session = await getSession(req, env.DB)
  } catch (error) {
    console.error('Signout session lookup error:', error)
    return createSignoutResponse(req, env, { error: 'database_error' }, 500)
  }

  if (req.nextUrl.searchParams.has('redirect')) {
    if (session) {
      try {
        await revokeSession(env.DB, session.sessionHash)
      } catch (error) {
        console.error('Signout session revocation error:', error)
        return createSignoutResponse(req, env, { error: 'database_error' }, 500)
      }
    }
    return createSignoutRedirect(
      trustedRedirectOrFallback(req.nextUrl.searchParams.get('redirect'), env),
    )
  }

  if (!session) {
    const response = createSignoutResponse(req, env, { error: 'not_authenticated' }, 401)
    deleteSessionCookie(response.cookies)
    return response
  }

  const csrfToken = generateCsrfToken()
  const cookieResponse = createSignoutResponse(req, env, {})
  const encryptedToken = await setCsrfTokenCookie(cookieResponse.cookies, csrfToken, session.sessionHash)
  return NextResponse.json(
    { csrfToken: encryptedToken },
    { headers: cookieResponse.headers },
  )
}

export async function POST(req: NextRequest) {
  const env = getServerEnv<SignoutEnv>()
  const response = createSignoutResponse(req, env, { success: true })
  const cookies = response.cookies
  
  const allowedOrigins = getAllowedAuthOrigins(env, req)
  
  if (allowedOrigins.length === 0 || !verifyOrigin(req, allowedOrigins)) {
    return createSignoutResponse(req, env, { error: 'invalid_origin' }, 403)
  }
  
  if (!env.DB) return createSignoutResponse(req, env, { error: 'database_error' }, 500)
  const session = await getSession(req, env.DB)
  if (!session) {
    const invalidResponse = createSignoutResponse(req, env, { error: 'not_authenticated' }, 401)
    deleteSessionCookie(invalidResponse.cookies)
    return invalidResponse
  }
  
  let body: { csrfToken?: string } = {}
  try {
    body = (await req.json()) as { csrfToken?: string }
  } catch {}
  const csrfTokenFromRequest = typeof body.csrfToken === 'string' ? body.csrfToken : null
  if (!(await verifyCsrfToken(req, csrfTokenFromRequest, session.sessionHash))) {
    return createSignoutResponse(req, env, { error: 'csrf_token_invalid' }, 403)
  }
  
  await revokeSession(env.DB, session.sessionHash)
  deleteSessionCookie(cookies)
  deleteCookie(cookies, 'csrf_token')
  return response
}

export async function OPTIONS(req: NextRequest) {
  const env = getServerEnv<SignoutEnv>()
  return createCorsPreflightResponse(req, getAllowedAuthOrigins(env, req))
}
