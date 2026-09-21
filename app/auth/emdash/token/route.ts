import { getSessionUserQuery } from '@/lib/auth-policy'
import {
  isValidCodeVerifier,
  sha256Base64Url,
  verifyCodeChallenge,
} from '@/lib/server/emdash'
import { getServerEnv } from '@/lib/server/env'
import type { D1Database } from '@/lib/server/d1'
import { getTrustedFrontendOrigins } from '@/lib/server/url'
import { NextRequest, NextResponse } from 'next/server'
type TokenEnv = {
  DB?: D1Database
  AUTH_URL?: string
  AUTH_TRUSTED_ORIGINS?: string
  NEXTJS_ENV?: string
}

type AuthorizationCode = {
  user_id: string
  code_challenge: string
}

type SessionUser = {
  id: string
  email: string
  given_name: string | null
  family_name: string | null
  display_name: string | null
  created_at: string
}

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'private, no-store' },
})

export async function POST(req: NextRequest) {
  const env = getServerEnv<TokenEnv>()
  const body = (await req.json().catch(() => null)) as {
    code?: unknown
    code_verifier?: unknown
    redirect_uri?: unknown
  } | null
  const code = body?.code
  const verifier = body?.code_verifier
  const redirectUri = body?.redirect_uri

  if (
    typeof code !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(code) ||
    !isValidCodeVerifier(verifier) ||
    typeof redirectUri !== 'string'
  ) return json({ error: 'invalid_request' }, 400)

  let callback: URL
  try {
    callback = new URL(redirectUri)
  } catch {
    return json({ error: 'invalid_redirect_uri' }, 400)
  }
  if (
    !getTrustedFrontendOrigins(env).includes(callback.origin) ||
    callback.pathname !== '/_emdash/api/auth/callback' ||
    callback.search ||
    callback.hash
  ) return json({ error: 'invalid_redirect_uri' }, 400)

  const db = env.DB
  if (!db) return json({ error: 'server_configuration_error' }, 500)

  const codeHash = await sha256Base64Url(code)
  const authorization = await db.prepare(
    `DELETE FROM emdash_authorization_codes
      WHERE code_hash = ? AND redirect_uri = ? AND expires_at > ?
      RETURNING user_id, code_challenge`,
  ).bind(codeHash, redirectUri, new Date().toISOString()).first<AuthorizationCode>()

  if (!authorization) return json({ error: 'invalid_grant' }, 400)
  if (!(await verifyCodeChallenge(verifier, authorization.code_challenge))) {
    return json({ error: 'invalid_grant' }, 400)
  }

  const user = await db.prepare(
    getSessionUserQuery(),
  ).bind(authorization.user_id).first<SessionUser>()
  if (!user) return json({ error: 'invalid_grant' }, 400)

  const name = user.display_name ||
    `${user.family_name || ''} ${user.given_name || ''}`.trim() ||
    user.email
  return json({
    user: {
      id: user.id,
      email: user.email,
      name,
    },
  })
}
