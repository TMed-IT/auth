import { deleteCookie, readEncryptedCookie, setAuthCookie, generateCsrfToken, setCsrfTokenCookie, verifyCsrfToken, verifyOrigin, validateAuthTokenMaxAge } from '@/app/api/_auth/token'
import { generateJWT } from '@/app/api/_auth/auth'
import { getServerEnv, requireEnv } from '@/lib/server/env'
import { getTrustedAuthOrigin, trustedRedirectOrFallback } from '@/lib/server/url'
import type { D1Database } from '@/lib/server/d1'
import { NextRequest, NextResponse } from 'next/server'

type EnvBasic = {
  AUTH_TRUSTED_ORIGINS?: string
  AUTH_URL?: string
  AUTH_TOKEN_MAX_AGE?: number | string
  NEXTJS_ENV?: string
  DB?: D1Database
}

type PendingUser = { email: string; given_name?: string; family_name?: string; avatar?: string; redirect?: string }

export async function GET(req: NextRequest) {
  const response = NextResponse.json(
    {},
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
  const cookies = response.cookies
  
  const pending = await readEncryptedCookie(req, 'pending_user')
  if (!pending) {
    return NextResponse.json({ error: 'no_pending_user' }, { status: 400 })
  }
  
  let data: PendingUser | null = null
  try { data = JSON.parse(pending) as PendingUser } catch {}
  if (!data || !data.email) {
    return NextResponse.json({ error: 'invalid_pending_user' }, { status: 400 })
  }
  
  const csrfToken = generateCsrfToken()
  const sessionBinding = data.email
  const encryptedToken = await setCsrfTokenCookie(cookies, csrfToken, sessionBinding)
  return NextResponse.json({ csrfToken: encryptedToken }, { headers: response.headers })
}

export async function POST(req: NextRequest) {
  const env = getServerEnv<EnvBasic>()
  const response = NextResponse.json(
    { success: true },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
  const cookies = response.cookies
  
  requireEnv(env.AUTH_URL, 'AUTH_URL')
  const authOrigin = getTrustedAuthOrigin(env)
  if (!authOrigin) {
    throw new Error('AUTH_URL must be HTTPS (HTTP is allowed only for localhost)')
  }
  const allowedOrigins = [authOrigin]
  
  if (!verifyOrigin(req, allowedOrigins)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 })
  }
  
  const pending = await readEncryptedCookie(req, 'pending_user')
  if (!pending) {
    const cookie = req.headers.get('cookie') || ''
    const hasPendingUserCookie = cookie.includes('pending_user=')
    if (hasPendingUserCookie) {
      return NextResponse.json({ error: 'expired_session' }, { status: 400 })
    }
    return NextResponse.json({ error: 'no_pending_user' }, { status: 400 })
  }
  let data: PendingUser | null = null
  try { data = JSON.parse(pending) as PendingUser } catch {}
  if (!data || !data.email) return NextResponse.json({ error: 'invalid_pending_user' }, { status: 400 })

  let body: {
    csrfToken?: string
    agreedToTerms?: boolean
    agreedToPrivacy?: boolean
  } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {}
  if (body.agreedToTerms !== true || body.agreedToPrivacy !== true) {
    return NextResponse.json({ error: 'consent_required' }, { status: 400 })
  }
  
  const sessionBinding = data.email
  const csrfToken = typeof body.csrfToken === 'string' ? body.csrfToken : null
  if (!(await verifyCsrfToken(req, csrfToken, sessionBinding))) {
    return NextResponse.json({ error: 'csrf_token_invalid' }, { status: 403 })
  }

  const db = env.DB as D1Database
  type UserRow = { id: string; email: string; given_name: string; family_name: string; avatar: string | null }
  
  let id: string
  let name: string
  let avatar: string | null | undefined
  
  try {
    const existing = await db.prepare('SELECT * FROM users WHERE email = ?').bind(data.email).first<UserRow>()
    
    if (existing) {
      id = existing.id
      name = `${existing.family_name} ${existing.given_name}`.trim()
      if (data.avatar && data.avatar !== existing.avatar) {
        await db.prepare('UPDATE users SET avatar = ? WHERE id = ?').bind(data.avatar, id).run()
        avatar = data.avatar
      } else {
        avatar = existing.avatar
      }
    } else {
      id = crypto.randomUUID()
      const nowIso = new Date().toISOString()
      await db.prepare('INSERT INTO users(id, email, given_name, family_name, display_name, avatar, created_at) VALUES(?, ?, ?, ?, NULL, ?, ?)')
        .bind(id, data.email, data.given_name || '', data.family_name || '', data.avatar || null, nowIso).run()
      name = `${data.family_name || ''} ${data.given_name || ''}`.trim()
      avatar = data.avatar
    }
  } catch (dbError) {
    console.error('Database error:', dbError)
    return NextResponse.json({ error: 'database_error' }, { status: 500 })
  }

  try {
    const avatarValue = avatar || undefined
    
    const authTokenMaxAge = validateAuthTokenMaxAge(env.AUTH_TOKEN_MAX_AGE, 'AUTH_TOKEN_MAX_AGE')
    const jwt = await generateJWT({ id, email: data.email, name, avatar: avatarValue }, authTokenMaxAge)
    setAuthCookie(cookies, jwt)
    deleteCookie(cookies, 'pending_user')
    deleteCookie(cookies, 'csrf_token')

    const location = trustedRedirectOrFallback((data.redirect as string) || null, env)
    
    return NextResponse.json({ success: true, redirect: location }, { headers: response.headers })
  } catch (error) {
    console.error('Consent processing error:', error)
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }
}
