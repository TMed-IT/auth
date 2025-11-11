import { deleteCookie, readEncryptedCookie, setAuthCookie, generateCsrfToken, setCsrfTokenCookie, verifyCsrfTokenFromCookie, verifyOrigin, validateAuthTokenMaxAge } from '@/app/api/_auth/token'
import { generateJWT } from '@/app/api/_auth/auth'
import { getServerEnv, requireEnv } from '@/lib/server/env'
import { sameDomainRedirectOrFallback } from '@/lib/server/url'
import type { D1Database } from '@/lib/server/d1'
import { NextRequest, NextResponse } from 'next/server'

type EnvBasic = { FRONTEND_URL?: string; AUTH_URL?: string; AUTH_COOKIE_DOMAIN?: string; AUTH_TOKEN_MAX_AGE?: number | string; DB?: D1Database }

type PendingUser = { email: string; given_name?: string; family_name?: string; avatar?: string; redirect?: string }

export async function GET(req: NextRequest) {
  const response = NextResponse.json({})
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
  await setCsrfTokenCookie(cookies, csrfToken, sessionBinding)
  return response
}

export async function POST(req: NextRequest) {
  const env = getServerEnv<EnvBasic>()
  const response = NextResponse.json({ success: true })
  const cookies = response.cookies
  
  const authUrl = requireEnv(env.AUTH_URL, 'AUTH_URL')
  const frontendUrl = requireEnv(env.FRONTEND_URL, 'FRONTEND_URL')
  const allowedOrigins = [authUrl, frontendUrl].filter(Boolean)
  
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
  
  const sessionBinding = data.email
  if (!(await verifyCsrfTokenFromCookie(req, sessionBinding))) {
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

    const fallback = requireEnv(env.FRONTEND_URL, 'FRONTEND_URL')
    const location = sameDomainRedirectOrFallback((data.redirect as string) || null, fallback, env)
    
    return NextResponse.json({ success: true, redirect: location }, { headers: response.headers })
  } catch (error) {
    console.error('Consent processing error:', error)
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }
}
