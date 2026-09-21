import { getSessionUserQuery } from '@/lib/auth-policy'
import {
  generateAuthorizationCode,
  isValidAuthorizationState,
  isValidCodeChallenge,
  sha256Base64Url,
} from '@/lib/server/emdash'
import { getServerEnv } from '@/lib/server/env'
import type { D1Database } from '@/lib/server/d1'
import {
  getTrustedAuthOrigin,
  trustedFrontendOriginOrNull,
  trustedEmDashContinuationOrNull,
} from '@/lib/server/url'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/server/sessions'
import type { ErrorCode, ErrorKey } from '@/config/site'

type AuthorizeEnv = {
  DB?: D1Database
  AUTH_URL?: string
  AUTH_TRUSTED_ORIGINS?: string
  NEXTJS_ENV?: string
}

type SessionUser = {
  id: string
  email: string
  given_name: string | null
  family_name: string | null
  display_name: string | null
  created_at: string
}

const noStore = { 'Cache-Control': 'private, no-store' }

export async function GET(req: NextRequest) {
  const env = getServerEnv<AuthorizeEnv>()
  const requestUrl = new URL(req.url)
  const redirectUri = requestUrl.searchParams.get('redirect_uri')
  const state = requestUrl.searchParams.get('state')
  const codeChallenge = requestUrl.searchParams.get('code_challenge')
  const method = requestUrl.searchParams.get('code_challenge_method')
  const errorOrigin = getTrustedAuthOrigin(env) ?? requestUrl.origin
  const errorResponse = (key: ErrorKey, code: ErrorCode) => {
    const errorUrl = new URL('/error', errorOrigin)
    errorUrl.searchParams.set('key', key)
    errorUrl.searchParams.set('code', code)
    return NextResponse.redirect(errorUrl, { status: 302, headers: noStore })
  }

  if (
    !trustedEmDashContinuationOrNull(requestUrl.toString(), env) ||
    !redirectUri ||
    !isValidAuthorizationState(state) ||
    !isValidCodeChallenge(codeChallenge) ||
    method !== 'S256'
  ) {
    return errorResponse('authorization_error', 'invalid_request')
  }

  const db = env.DB
  let user: SessionUser | null = null
  const session = db ? await getSession(req, db) : null
  if (session && db) {
    user = await db.prepare(
      getSessionUserQuery(),
    ).bind(session.userId).first<SessionUser>()
  }

  if (!user) {
    const authOrigin = getTrustedAuthOrigin(env)
    if (!authOrigin) {
      return errorResponse('authorization_error', 'server_configuration_error')
    }
    const loginUrl = new URL('/', authOrigin)
    loginUrl.searchParams.set('redirect', requestUrl.toString())
    return NextResponse.redirect(loginUrl, { status: 302, headers: noStore })
  }

  if (!db || !trustedFrontendOriginOrNull(new URL(redirectUri).origin, env)) {
    return errorResponse('authorization_error', 'server_configuration_error')
  }

  const code = generateAuthorizationCode()
  const codeHash = await sha256Base64Url(code)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 60_000).toISOString()

  await db.prepare('DELETE FROM emdash_authorization_codes WHERE expires_at <= ?')
    .bind(now.toISOString()).run()
  await db.prepare(
    `INSERT INTO emdash_authorization_codes(
      code_hash, user_id, redirect_uri, code_challenge, expires_at, created_at
    ) VALUES(?, ?, ?, ?, ?, ?)`,
  ).bind(
    codeHash,
    user.id,
    redirectUri,
    codeChallenge,
    expiresAt,
    now.toISOString(),
  ).run()

  const callback = new URL(redirectUri)
  callback.searchParams.set('code', code)
  callback.searchParams.set('state', state)
  return NextResponse.redirect(callback, { status: 302, headers: noStore })
}
