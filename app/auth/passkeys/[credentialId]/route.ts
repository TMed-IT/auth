import { NextRequest, NextResponse } from 'next/server'
import { verifyCsrfToken, verifyOrigin } from '@/app/api/_auth/token'
import { applyCredentialedCors, createCorsPreflightResponse } from '@/lib/server/cors'
import { getServerEnv } from '@/lib/server/env'
import {
  getAuthenticatedPasskeyUser,
  getPasskeyAllowedOrigins,
  type PasskeyEnv,
} from '@/lib/server/passkeys'
import { isPasskeyOwner, normalizePasskeyName } from '@/lib/passkey-policy'

type RouteContext = { params: Promise<{ credentialId: string }> }

export async function DELETE(req: NextRequest, context: RouteContext) {
  const env = getServerEnv<PasskeyEnv>()
  const allowedOrigins = getPasskeyAllowedOrigins(env, req)
  const json = (body: unknown, status = 200) => applyCredentialedCors(
    NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } }),
    req,
    allowedOrigins,
  )

  if (!verifyOrigin(req, allowedOrigins)) return json({ error: 'invalid_origin' }, 403)
  const db = env.DB
  if (!db) return json({ error: 'database_error' }, 500)
  let user
  try {
    user = await getAuthenticatedPasskeyUser(req, db)
  } catch (error) {
    console.error('Passkey deletion user lookup error:', error)
    return json({ error: 'database_error' }, 500)
  }
  if (!user) return json({ error: 'unauthorized' }, 401)

  const body = (await req.json().catch(() => null)) as { csrfToken?: unknown } | null
  const csrfToken = typeof body?.csrfToken === 'string' ? body.csrfToken : null
  if (!(await verifyCsrfToken(req, csrfToken, user.id))) {
    return json({ error: 'csrf_token_invalid' }, 403)
  }

  const { credentialId } = await context.params
  if (!credentialId) return json({ error: 'invalid_request' }, 400)

  try {
    const existing = await db.prepare(
      'SELECT user_id FROM passkeys WHERE credential_id = ?',
    ).bind(credentialId).first<{ user_id: string }>()
    if (!isPasskeyOwner(existing, user.id)) return json({ error: 'not_found' }, 404)

    // Deliberately no "last credential" guard: Google login remains the
    // recovery path and users may remove their final passkey.
    await db.prepare(
      'DELETE FROM passkeys WHERE credential_id = ? AND user_id = ?',
    ).bind(credentialId, user.id).run()
    return json({ success: true })
  } catch (error) {
    console.error('Passkey deletion error:', error)
    return json({ error: 'database_error' }, 500)
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const env = getServerEnv<PasskeyEnv>()
  const allowedOrigins = getPasskeyAllowedOrigins(env, req)
  const json = (body: unknown, status = 200) => applyCredentialedCors(
    NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } }),
    req,
    allowedOrigins,
  )

  if (!verifyOrigin(req, allowedOrigins)) return json({ error: 'invalid_origin' }, 403)
  const db = env.DB
  if (!db) return json({ error: 'database_error' }, 500)

  let user
  try {
    user = await getAuthenticatedPasskeyUser(req, db)
  } catch (error) {
    console.error('Passkey rename user lookup error:', error)
    return json({ error: 'database_error' }, 500)
  }
  if (!user) return json({ error: 'unauthorized' }, 401)

  const body = (await req.json().catch(() => null)) as {
    csrfToken?: unknown
    name?: unknown
  } | null
  const csrfToken = typeof body?.csrfToken === 'string' ? body.csrfToken : null
  if (!(await verifyCsrfToken(req, csrfToken, user.id))) {
    return json({ error: 'csrf_token_invalid' }, 403)
  }
  const name = normalizePasskeyName(body?.name)
  if (!name) return json({ error: 'invalid_request' }, 400)

  const { credentialId } = await context.params
  if (!credentialId) return json({ error: 'invalid_request' }, 400)

  try {
    const existing = await db.prepare(
      'SELECT user_id FROM passkeys WHERE credential_id = ?',
    ).bind(credentialId).first<{ user_id: string }>()
    if (!isPasskeyOwner(existing, user.id)) return json({ error: 'not_found' }, 404)

    await db.prepare(
      'UPDATE passkeys SET name = ? WHERE credential_id = ? AND user_id = ?',
    ).bind(name, credentialId, user.id).run()
    return json({ success: true, name })
  } catch (error) {
    console.error('Passkey rename error:', error)
    return json({ error: 'database_error' }, 500)
  }
}

export async function OPTIONS(req: NextRequest) {
  const env = getServerEnv<PasskeyEnv>()
  return createCorsPreflightResponse(req, getPasskeyAllowedOrigins(env, req))
}
