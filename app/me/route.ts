import { deleteLegacyAuthCookie, deleteSessionCookie, getSessionCookie } from '@/app/api/_auth/token'
import { getSessionUserQuery } from '@/lib/auth-policy'
import { applyCredentialedCors, createCorsPreflightResponse } from '@/lib/server/cors'
import type { D1Database } from '@/lib/server/d1'
import { getServerEnv } from '@/lib/server/env'
import { getSession, revokeSession } from '@/lib/server/sessions'
import { getDefaultRedirectUrl, getTrustedAuthOrigin, getTrustedFrontendOrigins } from '@/lib/server/url'
import { NextRequest, NextResponse } from 'next/server'
import { normalizeAvatarPath } from '@/lib/avatar'

type MeEnv = {
  DB?: D1Database
  AUTH_URL?: string
  AUTH_DEFAULT_REDIRECT_URL?: string
  AUTH_TRUSTED_ORIGINS?: string
  NEXTJS_ENV?: string
}

type UserRow = {
  id: string
  email: string
  given_name: string | null
  family_name: string | null
  display_name: string | null
  avatar: string | null
  created_at: string
  consented_at: string
}

const getAllowedOrigins = (env: MeEnv) => {
  const authOrigin = getTrustedAuthOrigin(env)
  return [...new Set([
    ...(authOrigin ? [authOrigin] : []),
    ...getTrustedFrontendOrigins(env),
  ])]
}

const createMeResponse = (
  req: NextRequest,
  env: MeEnv,
  user: UserRow | null,
  clearSession = false,
) => {
  const safeUser = user
    ? { ...user, avatar: normalizeAvatarPath(user.avatar) }
    : null
  const response = NextResponse.json(
    {
      authenticated: Boolean(safeUser),
      consented: Boolean(safeUser?.consented_at),
      user: safeUser,
      defaultRedirectUrl: user ? getDefaultRedirectUrl(env) : null,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
  deleteLegacyAuthCookie(response.cookies)
  if (clearSession) deleteSessionCookie(response.cookies)
  return applyCredentialedCors(response, req, getAllowedOrigins(env))
}

export async function GET(req: NextRequest) {
  const env = getServerEnv<MeEnv>()
  const sessionId = getSessionCookie(req)
  if (!sessionId) return createMeResponse(req, env, null)

  const db = env.DB
  if (!db) {
    return NextResponse.json(
      { error: 'database_error' },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  try {
    const session = await getSession(req, db)
    if (!session) return createMeResponse(req, env, null, true)

    const user = await db.prepare(getSessionUserQuery())
      .bind(session.userId)
      .first<UserRow>()
    if (!user) {
      await revokeSession(db, session.sessionHash)
      return createMeResponse(req, env, null, true)
    }
    return createMeResponse(req, env, user)
  } catch (error) {
    console.error('Me lookup error:', error)
    return NextResponse.json(
      { error: 'database_error' },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  const env = getServerEnv<MeEnv>()
  return createCorsPreflightResponse(req, getAllowedOrigins(env))
}
