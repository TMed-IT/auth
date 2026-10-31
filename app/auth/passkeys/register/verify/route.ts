import { verifyRegistrationResponse } from '@simplewebauthn/server'
import { NextRequest, NextResponse } from 'next/server'
import { deleteCookie, readEncryptedCookie, verifyOrigin } from '@/app/api/_auth/token'
import { applyCredentialedCors, createCorsPreflightResponse } from '@/lib/server/cors'
import { getServerEnv } from '@/lib/server/env'
import {
  getAuthenticatedPasskeyUser,
  getPasskeyRelyingParty,
  isRegistrationResponse,
  isRegistrationStateForUser,
  parseRegistrationState,
  REGISTRATION_COOKIE,
  serializeTransports,
  type PasskeyEnv,
} from '@/lib/server/passkeys'
import { getDefaultPasskeyName } from '@/lib/passkey-policy'

export async function POST(req: NextRequest) {
  const env = getServerEnv<PasskeyEnv>()
  const { origin, rpID } = getPasskeyRelyingParty(env)
  const allowedOrigins = [origin]
  const json = (body: unknown, status = 200) => {
    const response = applyCredentialedCors(
      NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } }),
      req,
      allowedOrigins,
    )
    deleteCookie(response.cookies, REGISTRATION_COOKIE)
    return response
  }

  if (!verifyOrigin(req, allowedOrigins)) return json({ error: 'invalid_origin' }, 403)
  const db = env.DB
  if (!db) return json({ error: 'database_error' }, 500)

  let user
  try {
    user = await getAuthenticatedPasskeyUser(req, db)
  } catch (error) {
    console.error('Passkey registration user lookup error:', error)
    return json({ error: 'database_error' }, 500)
  }
  if (!user) return json({ error: 'unauthorized' }, 401)

  const state = parseRegistrationState(await readEncryptedCookie(req, REGISTRATION_COOKIE))
  if (!isRegistrationStateForUser(state, user.id)) return json({ error: 'invalid_challenge' }, 400)

  const body = (await req.json().catch(() => null)) as { response?: unknown } | null
  if (!isRegistrationResponse(body?.response)) {
    return json({ error: 'invalid_request' }, 400)
  }
  const name = getDefaultPasskeyName(body.response, req.headers.get('user-agent'))

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: state.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    })
  } catch (error) {
    console.error('Passkey registration verification error:', error)
    return json({ error: 'verification_failed' }, 400)
  }
  if (!verification.verified) return json({ error: 'verification_failed' }, 400)

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
  try {
    const duplicate = await db.prepare(
      'SELECT credential_id FROM passkeys WHERE credential_id = ?',
    ).bind(credential.id).first<{ credential_id: string }>()
    if (duplicate) return json({ error: 'credential_exists' }, 409)

    const now = new Date().toISOString()
    try {
      await db.prepare(
        `INSERT INTO passkeys(
          credential_id, user_id, name, public_key, counter, device_type,
          backed_up, transports, created_at, last_used_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      ).bind(
        credential.id,
        user.id,
        name,
        credential.publicKey,
        credential.counter,
        credentialDeviceType,
        credentialBackedUp ? 1 : 0,
        serializeTransports(credential.transports),
        now,
      ).run()
    } catch (error) {
      if (error instanceof Error && /unique|constraint/i.test(error.message)) {
        return json({ error: 'credential_exists' }, 409)
      }
      throw error
    }

    return json({
      success: true,
      redirect: state.redirect,
      credentialId: credential.id,
      name,
    })
  } catch (error) {
    console.error('Passkey registration database error:', error)
    return json({ error: 'database_error' }, 500)
  }
}

export async function OPTIONS(req: NextRequest) {
  const env = getServerEnv<PasskeyEnv>()
  return createCorsPreflightResponse(req, [getPasskeyRelyingParty(env).origin])
}
