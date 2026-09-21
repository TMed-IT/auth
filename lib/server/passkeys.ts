import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  Base64URLString,
  RegistrationResponseJSON,
  WebAuthnCredential,
} from '@simplewebauthn/server'

import type { D1Database } from '@/lib/server/d1'
import {
  getTrustedAuthOrigin,
  getTrustedFrontendOrigins,
  trustedRedirectOrNull,
} from '@/lib/server/url'
import { getSession } from '@/lib/server/sessions'
export {
  isRegistrationStateForUser,
  normalizePasskeyName,
  parseAuthenticationState,
  parseRegistrationState,
} from '@/lib/passkey-policy'
export type { AuthenticationState, RegistrationState } from '@/lib/passkey-policy'

export const REGISTRATION_COOKIE = 'passkey_registration'
export const AUTHENTICATION_COOKIE = 'passkey_authentication'

export type PasskeyEnv = {
  AUTH_URL?: string
  AUTH_TRUSTED_ORIGINS?: string
  SESSION_MAX_AGE?: number | string
  NEXTJS_ENV?: string
  DB?: D1Database
}

export type PasskeyUser = {
  id: string
  email: string
  given_name: string | null
  family_name: string | null
  display_name: string | null
  avatar: string | null
}

export type PasskeyRow = {
  credential_id: string
  user_id: string
  name: string
  public_key: ArrayBuffer | Uint8Array | number[]
  counter: number
  device_type: string
  backed_up: number
  transports: string | null
  created_at: string
  last_used_at: string | null
}

export const getPasskeyRelyingParty = (env: PasskeyEnv) => {
  const origin = getTrustedAuthOrigin(env)
  if (!origin) {
    throw new Error('AUTH_URL must be HTTPS (localhost HTTP is allowed only in development)')
  }
  return { origin, rpID: new URL(origin).hostname }
}

export const getPasskeyAllowedOrigins = (env: PasskeyEnv) => {
  const authOrigin = getTrustedAuthOrigin(env)
  return [...new Set([
    ...(authOrigin ? [authOrigin] : []),
    ...getTrustedFrontendOrigins(env),
  ])]
}

export const getPasskeyRedirect = (candidate: unknown, env: PasskeyEnv) =>
  trustedRedirectOrNull(typeof candidate === 'string' ? candidate : null, env)

export const getAuthenticatedPasskeyUser = async (
  req: Request,
  db: D1Database,
): Promise<PasskeyUser | null> => {
  const session = await getSession(req, db)
  if (!session) return null

  return db.prepare(
    `SELECT id, email, given_name, family_name, display_name, avatar
     FROM users WHERE id = ? AND consented_at IS NOT NULL`,
  ).bind(session.userId).first<PasskeyUser>()
}

export const getPasskeyUserDisplayName = (user: PasskeyUser) =>
  user.display_name || `${user.family_name || ''} ${user.given_name || ''}`.trim() || user.id

export const bytesToBase64Url = (bytes: Uint8Array): Base64URLString => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') as Base64URLString
}

export const userIdToBytes = (userId: string) => new TextEncoder().encode(userId)
export const userIdToBase64Url = (userId: string) => bytesToBase64Url(userIdToBytes(userId))

export const toUint8Array = (value: PasskeyRow['public_key']): Uint8Array<ArrayBuffer> => {
  if (value instanceof Uint8Array) return Uint8Array.from(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return new Uint8Array(value)
}

const allowedTransports = new Set<AuthenticatorTransportFuture>([
  'ble',
  'cable',
  'hybrid',
  'internal',
  'nfc',
  'smart-card',
  'usb',
])

export const deserializeTransports = (
  value: string | null,
): AuthenticatorTransportFuture[] | undefined => {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return undefined
    const transports = parsed.filter(
      (item): item is AuthenticatorTransportFuture =>
        typeof item === 'string' && allowedTransports.has(item as AuthenticatorTransportFuture),
    )
    return transports.length ? transports : undefined
  } catch {
    return undefined
  }
}

export const serializeTransports = (value: AuthenticatorTransportFuture[] | undefined) =>
  value?.length ? JSON.stringify(value) : null

export const rowToWebAuthnCredential = (row: PasskeyRow): WebAuthnCredential => ({
  id: row.credential_id as Base64URLString,
  publicKey: toUint8Array(row.public_key),
  counter: Number(row.counter),
  transports: deserializeTransports(row.transports),
})

export const isRegistrationResponse = (value: unknown): value is RegistrationResponseJSON => {
  if (!value || typeof value !== 'object') return false
  const response = value as Partial<RegistrationResponseJSON>
  return typeof response.id === 'string' && response.type === 'public-key' && !!response.response
}

export const isAuthenticationResponse = (value: unknown): value is AuthenticationResponseJSON => {
  if (!value || typeof value !== 'object') return false
  const response = value as Partial<AuthenticationResponseJSON>
  return typeof response.id === 'string' && response.type === 'public-key' && !!response.response
}
