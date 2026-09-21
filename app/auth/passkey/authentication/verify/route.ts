import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  deleteCookie,
  readEncryptedCookie,
  setSessionCookie,
  validateSessionMaxAge,
  verifyOrigin,
} from '@/app/api/_auth/token'
import { applyCredentialedCors, createCorsPreflightResponse } from '@/lib/server/cors'
import { getPasskeyAuthenticationQuery } from '@/lib/auth-policy'
import { getServerEnv } from '@/lib/server/env'
import {
  AUTHENTICATION_COOKIE,
  getPasskeyRelyingParty,
  isAuthenticationResponse,
  parseAuthenticationState,
  rowToWebAuthnCredential,
  type PasskeyEnv,
  type PasskeyRow,
  type PasskeyUser,
  userIdToBase64Url,
} from '@/lib/server/passkeys'
import { createSession } from '@/lib/server/sessions'
import { consumeAuthenticationChallenge } from '@/lib/server/passkey-challenges'

type AuthenticationPasskeyRow = PasskeyRow & PasskeyUser

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
    deleteCookie(response.cookies, AUTHENTICATION_COOKIE)
    return response
  }

  if (!verifyOrigin(req, allowedOrigins)) return json({ error: 'invalid_origin' }, 403)
  const state = parseAuthenticationState(await readEncryptedCookie(req, AUTHENTICATION_COOKIE))
  if (!state) return json({ error: 'invalid_challenge' }, 400)

  const body = (await req.json().catch(() => null)) as { response?: unknown } | null
  if (!isAuthenticationResponse(body?.response)) return json({ error: 'invalid_request' }, 400)
  const userHandle = body.response.response.userHandle
  if (typeof userHandle !== 'string' || !userHandle) {
    return json({ error: 'invalid_credential' }, 400)
  }

  const db = env.DB
  if (!db) return json({ error: 'database_error' }, 500)

  let passkey: AuthenticationPasskeyRow | null
  try {
    passkey = await db.prepare(
      getPasskeyAuthenticationQuery(),
    ).bind(body.response.id).first<AuthenticationPasskeyRow>()
  } catch (error) {
    console.error('Passkey authentication lookup error:', error)
    return json({ error: 'database_error' }, 500)
  }

  if (!passkey || userHandle !== userIdToBase64Url(passkey.user_id)) {
    return json({ error: 'invalid_credential' }, 400)
  }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: state.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: rowToWebAuthnCredential(passkey),
      requireUserVerification: true,
    })
  } catch (error) {
    console.error('Passkey authentication verification error:', error)
    return json({ error: 'verification_failed' }, 400)
  }
  if (!verification.verified) return json({ error: 'verification_failed' }, 400)

  try {
    if (!(await consumeAuthenticationChallenge(db, state.challenge))) {
      return json({ error: 'invalid_challenge' }, 400)
    }
    const now = new Date().toISOString()
    await db.prepare(
      'UPDATE passkeys SET counter = ?, last_used_at = ? WHERE credential_id = ? AND user_id = ?',
    ).bind(
      verification.authenticationInfo.newCounter,
      now,
      passkey.credential_id,
      passkey.user_id,
    ).run()

    const maxAge = validateSessionMaxAge(env.SESSION_MAX_AGE)
    const sessionId = await createSession(db, passkey.user_id, maxAge)
    const response = json({ success: true, redirect: state.redirect })
    setSessionCookie(response.cookies, sessionId)
    return response
  } catch (error) {
    console.error('Passkey authentication completion error:', error)
    return json({ error: 'processing_failed' }, 500)
  }
}

export async function OPTIONS(req: NextRequest) {
  const env = getServerEnv<PasskeyEnv>()
  return createCorsPreflightResponse(req, [getPasskeyRelyingParty(env).origin])
}
