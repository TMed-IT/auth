export type UserAccessRecord = {
  id: string | null
  consented_at?: string | null
}

export type UserAccessDecision = "login" | "consent" | "reject"

export function decideUserAccess(
  user: UserAccessRecord | null,
  allowSelfRegistration: boolean,
): UserAccessDecision {
  if (!user) return allowSelfRegistration ? "consent" : "reject"
  if (!user.id || !user.consented_at) return "consent"
  return "login"
}

export function getSessionUserQuery(): string {
  const fields = "id, email, given_name, family_name, display_name, avatar, created_at, consented_at"
  return `SELECT ${fields} FROM users WHERE id = ? AND consented_at IS NOT NULL`
}

export function getPasskeyAuthenticationQuery(): string {
  return `SELECT
    p.credential_id, p.user_id, p.name, p.public_key, p.counter,
    p.device_type, p.backed_up, p.transports, p.created_at, p.last_used_at,
    u.id, u.email, u.given_name, u.family_name, u.display_name, u.avatar
   FROM passkeys p JOIN users u ON u.id = p.user_id
   WHERE p.credential_id = ? AND u.consented_at IS NOT NULL`
}
