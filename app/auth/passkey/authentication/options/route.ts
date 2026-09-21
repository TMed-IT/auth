import { NextRequest, NextResponse } from 'next/server'

import { getTempCookieMaxAge, setEncryptedTempCookie, verifyOrigin } from '@/app/api/_auth/token'
import { applyCredentialedCors, createCorsPreflightResponse } from '@/lib/server/cors'
import { getServerEnv } from '@/lib/server/env'
import {
  AUTHENTICATION_COOKIE,
  getPasskeyRelyingParty,
  type PasskeyEnv,
} from '@/lib/server/passkeys'
import { getDefaultRedirectUrl, trustedAuthFlowRedirectOrNull } from '@/lib/server/url'
import { createPasskeyAuthenticationOptions } from '@/lib/webauthn-options'
import { storeAuthenticationChallenge } from '@/lib/server/passkey-challenges'

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
  const redirect = trustedAuthFlowRedirectOrNull(
    typeof body.redirect === 'string' ? body.redirect : null,
    env,
  ) ?? getDefaultRedirectUrl(env)

  try {
    const options = await createPasskeyAuthenticationOptions(rpID)
    const maxAge = getTempCookieMaxAge()
    await storeAuthenticationChallenge(db, options.challenge, maxAge)
    const response = json(options)
    await setEncryptedTempCookie(
      response.cookies,
      AUTHENTICATION_COOKIE,
      JSON.stringify({ challenge: options.challenge, redirect }),
      maxAge,
    )
    return response
  } catch (error) {
    console.error('Passkey authentication options error:', error)
    return json({ error: 'authentication_options_failed' }, 500)
  }
}

export async function OPTIONS(req: NextRequest) {
  const env = getServerEnv<PasskeyEnv>()
  return createCorsPreflightResponse(req, [getPasskeyRelyingParty(env).origin])
}
