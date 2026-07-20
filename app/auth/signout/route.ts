import { deleteAuthCookie, deleteCookie, deleteLegacyAuthCookie, getAuthCookie, generateCsrfToken, setCsrfTokenCookie, verifyCsrfToken, verifyOrigin } from '@/app/api/_auth/token'
import { getServerEnv } from '@/lib/server/env'
import { verifyJWT } from '@/app/api/_auth/auth'
import { applyCredentialedCors, createCorsPreflightResponse } from '@/lib/server/cors'
import { getTrustedAuthOrigin, getTrustedFrontendOrigins } from '@/lib/server/url'
import { NextRequest, NextResponse } from 'next/server'

type SignoutEnv = {
  AUTH_URL?: string
  AUTH_TRUSTED_ORIGINS?: string
  NEXTJS_ENV?: string
}

const getAllowedOrigins = (env: SignoutEnv) => {
  const authOrigin = getTrustedAuthOrigin(env)
  return [...new Set([
    ...(authOrigin ? [authOrigin] : []),
    ...getTrustedFrontendOrigins(env),
  ])]
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
  return applyCredentialedCors(response, req, getAllowedOrigins(env))
}

export async function GET(req: NextRequest) {
  const env = getServerEnv<SignoutEnv>()
  const token = getAuthCookie(req)
  if (!token) {
    return createSignoutResponse(req, env, { error: 'not_authenticated' }, 401)
  }
  
  const payload = await verifyJWT(token)
  if (!payload || typeof payload.sub !== 'string') {
    return createSignoutResponse(req, env, { error: 'invalid_token' }, 401)
  }
  
  const csrfToken = generateCsrfToken()
  const sessionBinding = payload.sub
  const cookieResponse = createSignoutResponse(req, env, {})
  const encryptedToken = await setCsrfTokenCookie(cookieResponse.cookies, csrfToken, sessionBinding)
  return NextResponse.json(
    { csrfToken: encryptedToken },
    { headers: cookieResponse.headers },
  )
}

export async function POST(req: NextRequest) {
  const env = getServerEnv<SignoutEnv>()
  const response = createSignoutResponse(req, env, { success: true })
  const cookies = response.cookies
  
  const allowedOrigins = getAllowedOrigins(env)
  
  if (allowedOrigins.length === 0 || !verifyOrigin(req, allowedOrigins)) {
    return createSignoutResponse(req, env, { error: 'invalid_origin' }, 403)
  }
  
  const token = getAuthCookie(req)
  if (!token) {
    return createSignoutResponse(req, env, { error: 'not_authenticated' }, 401)
  }
  
  const payload = await verifyJWT(token)
  if (!payload || typeof payload.sub !== 'string') {
    return createSignoutResponse(req, env, { error: 'invalid_token' }, 401)
  }
  
  let body: { csrfToken?: string } = {}
  try {
    body = (await req.json()) as { csrfToken?: string }
  } catch {}
  const csrfTokenFromRequest = typeof body.csrfToken === 'string' ? body.csrfToken : null
  const sessionBinding = payload.sub
  if (!(await verifyCsrfToken(req, csrfTokenFromRequest, sessionBinding))) {
    return createSignoutResponse(req, env, { error: 'csrf_token_invalid' }, 403)
  }
  
  deleteAuthCookie(cookies)
  deleteCookie(cookies, 'csrf_token')
  return response
}

export async function OPTIONS(req: NextRequest) {
  const env = getServerEnv<SignoutEnv>()
  return createCorsPreflightResponse(req, getAllowedOrigins(env))
}
