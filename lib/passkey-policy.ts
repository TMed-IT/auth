export type PublicPasskeySource = {
  credential_id: string
  name: string
  device_type: string
  backed_up: number
  transports: string | null
  created_at: string
  last_used_at: string | null
}

export type RegistrationState = {
  challenge: string
  userId: string
  redirect: string
}

export type AuthenticationState = {
  challenge: string
  redirect: string
}

export const normalizePasskeyName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  const length = Array.from(normalized).length
  return length >= 1 && length <= 64 ? normalized : null
}

type PasskeyRegistrationDescriptor = {
  authenticatorAttachment?: string
  response?: {
    transports?: string[]
  }
}

export const getDefaultPasskeyName = (
  registration: PasskeyRegistrationDescriptor,
  userAgent: string | null,
): string => {
  const transports = registration.response?.transports ?? []
  const isPlatform =
    registration.authenticatorAttachment === 'platform' ||
    transports.includes('internal')
  const agent = userAgent ?? ''

  if (isPlatform) {
    if (/iPhone|iPad|iPod|Macintosh/i.test(agent)) return 'iCloud Keychain'
    if (/Windows/i.test(agent)) return 'Windows Hello'
    if (/Android|CrOS/i.test(agent)) return 'Google Password Manager'
    return 'この端末のパスキー'
  }
  if (transports.some((transport) => ['usb', 'nfc', 'ble', 'smart-card'].includes(transport))) {
    return 'セキュリティキー'
  }
  if (transports.includes('hybrid')) return '別の端末のパスキー'
  return 'パスキー'
}

export const isPasskeyOwner = (
  passkey: { user_id: string } | null,
  userId: string,
) => passkey?.user_id === userId

export const isRegistrationStateForUser = (
  state: RegistrationState | null,
  userId: string,
): state is RegistrationState => state?.userId === userId

export const parseRegistrationState = (value: string | null): RegistrationState | null => {
  if (!value) return null
  try {
    const state = JSON.parse(value) as Partial<RegistrationState>
    if (
      typeof state.challenge !== 'string' || !state.challenge ||
      typeof state.userId !== 'string' || !state.userId ||
      typeof state.redirect !== 'string' || !state.redirect
    ) return null
    return state as RegistrationState
  } catch {
    return null
  }
}

export const parseAuthenticationState = (value: string | null): AuthenticationState | null => {
  if (!value) return null
  try {
    const state = JSON.parse(value) as Partial<AuthenticationState>
    if (
      typeof state.challenge !== 'string' || !state.challenge ||
      typeof state.redirect !== 'string' || !state.redirect
    ) return null
    return state as AuthenticationState
  } catch {
    return null
  }
}

export const toPublicPasskey = (
  row: PublicPasskeySource,
  transports: string[],
) => ({
  id: row.credential_id,
  name: row.name,
  deviceType: row.device_type,
  backedUp: Boolean(row.backed_up),
  transports,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
})
