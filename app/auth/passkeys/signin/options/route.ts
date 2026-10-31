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
import { checkGlobalRateLimit } from '@/lib/server/rate-limit'

export async function POST(req: NextRequest) {
  const env = getServerEnv<PasskeyEnv>()
  const { origin, rpID } = getPasskeyRelyingParty(env)
  const allowedOrigins = [origin]
  const json = (body: unknown, status = 200, headers?: Record<string, string>) => applyCredentialedCors(
    NextResponse.json(body, {
      status,
      headers: { 'Cache-Control': 'private, no-store', ...headers },
    }),
    req,
    allowedOrigins,
  )

  if (!verifyOrigin(req, allowedOrigins)) return json({ error: 'invalid_origin' }, 403)
  const rateLimit = await checkGlobalRateLimit(
    env.PASSKEY_OPTIONS_RATE_LIMITER,
    `passkey-options:${origin}`,
  )
  if (rateLimit === 'unavailable') {
    return json({ error: 'server_configuration_error' }, 500)
  }
  if (rateLimit === 'limited') {
    return json({ error: 'temporarily_unavailable' }, 429, { 'Retry-After': '10' })
  }

  const body = (await req.json().catch(() => ({}))) as { redirect?: unknown }
  const redirect = trustedAuthFlowRedirectOrNull(
    typeof body?.redirect === 'string' ? body.redirect : null,
    env,
  ) ?? getDefaultRedirectUrl(env)

  try {
    const options = await createPasskeyAuthenticationOptions(rpID)
    const maxAge = getTempCookieMaxAge()
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
