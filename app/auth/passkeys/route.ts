import { NextRequest, NextResponse } from 'next/server'

import { generateCsrfToken, setCsrfTokenCookie } from '@/app/api/_auth/token'
import { applyCredentialedCors, createCorsPreflightResponse } from '@/lib/server/cors'
import { getServerEnv } from '@/lib/server/env'
import {
  deserializeTransports,
  getAuthenticatedPasskeyUser,
  getPasskeyAllowedOrigins,
  type PasskeyEnv,
  type PasskeyRow,
} from '@/lib/server/passkeys'
import { toPublicPasskey } from '@/lib/passkey-policy'

export async function GET(req: NextRequest) {
  const env = getServerEnv<PasskeyEnv>()
  const allowedOrigins = getPasskeyAllowedOrigins(env, req)
  const json = (body: unknown, status = 200) => applyCredentialedCors(
    NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } }),
    req,
    allowedOrigins,
  )

  const db = env.DB
  if (!db) return json({ error: 'database_error' }, 500)

  try {
    const user = await getAuthenticatedPasskeyUser(req, db)
    if (!user) return json({ error: 'unauthorized' }, 401)

    const rows = await db.prepare(
      `SELECT credential_id, name, device_type, backed_up, transports, created_at, last_used_at
       FROM passkeys WHERE user_id = ? ORDER BY created_at DESC`,
    ).bind(user.id).all<Pick<
      PasskeyRow,
      'credential_id' | 'name' | 'device_type' | 'backed_up' | 'transports' | 'created_at' | 'last_used_at'
    >>()

    const passkeys = rows.results.map((row) =>
      toPublicPasskey(row, deserializeTransports(row.transports) ?? []),
    )
    const csrfToken = generateCsrfToken()
    const response = json({ passkeys, csrfToken: '' })
    const encryptedToken = await setCsrfTokenCookie(response.cookies, csrfToken, user.id)
    // Re-create the response so the encrypted double-submit token is present in
    // both the JSON body and HttpOnly cookie.
    const finalResponse = json({ passkeys, csrfToken: encryptedToken })
    for (const cookie of response.cookies.getAll()) finalResponse.cookies.set(cookie)
    return finalResponse
  } catch (error) {
    console.error('Passkey list error:', error)
    return json({ error: 'database_error' }, 500)
  }
}

export async function OPTIONS(req: NextRequest) {
  const env = getServerEnv<PasskeyEnv>()
  return createCorsPreflightResponse(req, getPasskeyAllowedOrigins(env, req))
}
