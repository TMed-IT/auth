import { NextRequest, NextResponse } from 'next/server'
import siteConfig from '@site-config'

import { getTempCookieMaxAge, setEncryptedTempCookie, verifyOrigin } from '@/app/api/_auth/token'
import { applyCredentialedCors, createCorsPreflightResponse } from '@/lib/server/cors'
import { getServerEnv } from '@/lib/server/env'
import {
  getAuthenticatedPasskeyUser,
  getPasskeyRedirect,
  getPasskeyRelyingParty,
  getPasskeyUserDisplayName,
  REGISTRATION_COOKIE,
  type PasskeyEnv,
  type PasskeyRow,
  deserializeTransports,
  userIdToBytes,
} from '@/lib/server/passkeys'
import { getDefaultRedirectUrl } from '@/lib/server/url'
import { createPasskeyRegistrationOptions } from '@/lib/webauthn-options'

export async function POST(req: NextRequest) {
  const env = getServerEnv<PasskeyEnv>()
  const { origin, rpID } = getPasskeyRelyingParty(env)
  const allowedOrigins = [origin]
  const json = (body: unknown, status = 200) => applyCredentialedCors(
    NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } }),
    req,
    allowedOrigins,
  )

  if (!verifyOrigin(req, allowedOrigins)) return json({ error: 'invalid_origin' }, 403)

  const db = env.DB
  if (!db) return json({ error: 'database_error' }, 500)

  const body = (await req.json().catch(() => ({}))) as { redirect?: unknown }
  const redirect = getPasskeyRedirect(body.redirect, env) ?? getDefaultRedirectUrl(env)

  try {
    const user = await getAuthenticatedPasskeyUser(req, db)
    if (!user) return json({ error: 'unauthorized' }, 401)

    const existing = await db.prepare(
      'SELECT credential_id, transports FROM passkeys WHERE user_id = ?',
    ).bind(user.id).all<Pick<PasskeyRow, 'credential_id' | 'transports'>>()

    const options = await createPasskeyRegistrationOptions({
      rpName: siteConfig.brand.organizationName,
      rpID,
      userId: userIdToBytes(user.id),
      userName: user.id,
      userDisplayName: getPasskeyUserDisplayName(user),
      excludeCredentials: existing.results.map((passkey) => ({
        id: passkey.credential_id,
        transports: deserializeTransports(passkey.transports),
      })),
    })

    const response = json(options)
    await setEncryptedTempCookie(
      response.cookies,
      REGISTRATION_COOKIE,
      JSON.stringify({ challenge: options.challenge, userId: user.id, redirect }),
      getTempCookieMaxAge(),
    )
    return response
  } catch (error) {
    console.error('Passkey registration options error:', error)
    return json({ error: 'database_error' }, 500)
  }
}

export async function OPTIONS(req: NextRequest) {
  const env = getServerEnv<PasskeyEnv>()
  return createCorsPreflightResponse(req, [getPasskeyRelyingParty(env).origin])
}
