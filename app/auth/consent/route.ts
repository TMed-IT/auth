import { deleteCookie, readEncryptedCookie, setSessionCookie, generateCsrfToken, setCsrfTokenCookie, verifyCsrfToken, verifyOrigin, validateSessionMaxAge } from '@/app/api/_auth/token'
import { getServerEnv, requireEnv } from '@/lib/server/env'
import { getTrustedAuthOrigin, trustedAuthFlowRedirectOrFallback } from '@/lib/server/url'
import type { D1Database } from '@/lib/server/d1'
import { NextRequest, NextResponse } from 'next/server'
import siteConfig from '@site-config'
import { createSession } from '@/lib/server/sessions'
import { normalizeAvatarPath } from '@/lib/avatar'

type EnvBasic = {
  AUTH_TRUSTED_ORIGINS?: string
  AUTH_URL?: string
  SESSION_MAX_AGE?: number | string
  NEXTJS_ENV?: string
  DB?: D1Database
}

type PendingUser = {
  email: string
  given_name?: string
  family_name?: string
  display_name?: string
  avatar?: string
  redirect?: string
}

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
  const avatar = normalizeAvatarPath(data.avatar)
  const encryptedToken = await setCsrfTokenCookie(cookies, csrfToken, sessionBinding)
  return NextResponse.json({
    csrfToken: encryptedToken,
    user: {
      email: data.email,
      given_name: data.given_name || null,
      family_name: data.family_name || null,
      display_name: data.display_name || null,
      avatar,
    },
  }, { headers: response.headers })
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
  type UserRow = {
    id: string | null
    email: string
    given_name: string | null
    family_name: string | null
    avatar: string | null
    consented_at: string | null
  }
  
  let id: string
  const avatar = normalizeAvatarPath(data.avatar)
  
  try {
    const existing = await db.prepare(
      'SELECT id, email, given_name, family_name, avatar, consented_at FROM users WHERE email = ?',
    ).bind(data.email).first<UserRow>()

    if (!siteConfig.auth.allowSelfRegistration) {
      if (!existing) {
        return NextResponse.json({ error: 'email_not_allowlisted' }, { status: 403 })
      }

      id = existing.id || crypto.randomUUID()
      const nowIso = new Date().toISOString()
      const givenName = data.given_name || ''
      const familyName = data.family_name || ''
      const displayName = data.display_name || `${familyName} ${givenName}`.trim()
      await db.prepare(
        'UPDATE users SET id = ?, given_name = ?, family_name = ?, display_name = ?, avatar = ?, consented_at = ? WHERE email = ?',
      ).bind(id, givenName, familyName, displayName, avatar, nowIso, data.email).run()
    } else if (existing) {
      if (!existing.id) throw new Error('Existing external user has no id')
      id = existing.id
      const nowIso = new Date().toISOString()
      const givenName = data.given_name || existing.given_name || ''
      const familyName = data.family_name || existing.family_name || ''
      const displayName = data.display_name || `${familyName} ${givenName}`.trim()
      await db.prepare(
        'UPDATE users SET given_name = ?, family_name = ?, display_name = ?, avatar = ?, consented_at = ? WHERE id = ?',
      ).bind(
        givenName,
        familyName,
        displayName,
        avatar || normalizeAvatarPath(existing.avatar),
        nowIso,
        id,
      ).run()
    } else {
      id = crypto.randomUUID()
      const nowIso = new Date().toISOString()
      const givenName = data.given_name || ''
      const familyName = data.family_name || ''
      const displayName = data.display_name || `${familyName} ${givenName}`.trim()
      await db.prepare(
        'INSERT INTO users(id, email, given_name, family_name, display_name, avatar, created_at, consented_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(id, data.email, givenName, familyName, displayName, avatar, nowIso, nowIso).run()
    }
  } catch (dbError) {
    console.error('Database error:', dbError)
    return NextResponse.json({ error: 'database_error' }, { status: 500 })
  }

  try {
    const maxAge = validateSessionMaxAge(env.SESSION_MAX_AGE)
    const sessionId = await createSession(db, id, maxAge)
    setSessionCookie(cookies, sessionId)
    deleteCookie(cookies, 'pending_user')
    deleteCookie(cookies, 'csrf_token')

    const location = trustedAuthFlowRedirectOrFallback((data.redirect as string) || null, env)
    
    return NextResponse.json({ success: true, redirect: location }, { headers: response.headers })
  } catch (error) {
    console.error('Consent processing error:', error)
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }
}
