import { deleteAuthCookie, getAuthCookie, generateCsrfToken, setCsrfTokenCookie, verifyCsrfToken, verifyOrigin } from '@/app/api/_auth/token'
import { getServerEnv } from '@/lib/server/env'
import { verifyJWT } from '@/app/api/_auth/auth'
import { NextRequest, NextResponse } from 'next/server'

type SignoutEnv = { AUTH_URL?: string; FRONTEND_URL?: string }

export async function GET(req: NextRequest) {
  const response = NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  const cookies = response.cookies
  
  const token = getAuthCookie(req)
  if (!token) {
    return response
  }
  
  const payload = await verifyJWT(token)
  if (!payload || typeof payload.sub !== 'string') {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }
  
  const csrfToken = generateCsrfToken()
  const sessionBinding = payload.sub
  const encryptedToken = await setCsrfTokenCookie(cookies, csrfToken, sessionBinding)
  return NextResponse.json({ csrfToken: encryptedToken }, { headers: response.headers })
}

export async function POST(req: NextRequest) {
  const env = getServerEnv<SignoutEnv>()
  const response = NextResponse.json({ success: true })
  const cookies = response.cookies
  
  const authUrl = env.AUTH_URL
  const frontendUrl = env.FRONTEND_URL
  const allowedOrigins = [authUrl, frontendUrl].filter(Boolean) as string[]
  
  if (allowedOrigins.length > 0 && !verifyOrigin(req, allowedOrigins)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 })
  }
  
  const token = getAuthCookie(req)
  if (!token) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }
  
  const payload = await verifyJWT(token)
  if (!payload || typeof payload.sub !== 'string') {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }
  
  let body: { csrfToken?: string } = {}
  try {
    body = (await req.json()) as { csrfToken?: string }
  } catch {}
  const csrfTokenFromRequest = typeof body.csrfToken === 'string' ? body.csrfToken : null
  const sessionBinding = payload.sub
  if (!(await verifyCsrfToken(req, csrfTokenFromRequest, sessionBinding))) {
    return NextResponse.json({ error: 'csrf_token_invalid' }, { status: 403 })
  }
  
  deleteAuthCookie(cookies)
  return response
}


