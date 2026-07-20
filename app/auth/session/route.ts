import { deleteLegacyAuthCookie, getAuthCookie } from '@/app/api/_auth/token'
import { verifyJWT } from '@/app/api/_auth/auth'
import { getServerEnv } from '@/lib/server/env'
import type { D1Database } from '@/lib/server/d1'
import { applyCredentialedCors, createCorsPreflightResponse } from '@/lib/server/cors'
import { getTrustedFrontendOrigins } from '@/lib/server/url'
import { NextRequest, NextResponse } from 'next/server'

type SessionEnv = {
  DB?: D1Database
  AUTH_URL?: string
  AUTH_TRUSTED_ORIGINS?: string
  NEXTJS_ENV?: string
}

const createSessionResponse = (
  req: NextRequest,
  env: SessionEnv,
  user: Record<string, unknown> | null,
) => {
  const response = NextResponse.json(
    { user },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
  deleteLegacyAuthCookie(response.cookies)
  return applyCredentialedCors(response, req, getTrustedFrontendOrigins(env))
}

export async function GET(req: NextRequest) {
  const env = getServerEnv<SessionEnv>()
  const token = getAuthCookie(req)
  if (!token) return createSessionResponse(req, env, null)
  const payload = await verifyJWT(token)
  if (!payload || typeof payload.sub !== 'string') return createSessionResponse(req, env, null)
  const db = env.DB as D1Database
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(payload.sub).first<{ id: string; email: string; given_name: string; family_name: string; display_name: string | null; created_at: string }>()
  if (!row) return createSessionResponse(req, env, null)
  return createSessionResponse(req, env, {
    id: row.id,
    email: row.email,
    given_name: row.given_name,
    family_name: row.family_name,
    display_name: row.display_name,
    created_at: row.created_at,
  })
}

export async function OPTIONS(req: NextRequest) {
  const env = getServerEnv<SessionEnv>()
  return createCorsPreflightResponse(req, getTrustedFrontendOrigins(env))
}
