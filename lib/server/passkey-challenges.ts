import type { D1Database } from './d1'

export const storeAuthenticationChallenge = async (
  db: D1Database,
  challenge: string,
  maxAgeSeconds: number,
): Promise<void> => {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + maxAgeSeconds * 1000).toISOString()

  await db.prepare('DELETE FROM passkey_authentication_challenges WHERE expires_at <= ?')
    .bind(now.toISOString()).run()
  await db.prepare(
    'INSERT INTO passkey_authentication_challenges(challenge, expires_at) VALUES(?, ?)',
  ).bind(challenge, expiresAt).run()
}

export const consumeAuthenticationChallenge = async (
  db: D1Database,
  challenge: string,
): Promise<boolean> => {
  // A single write makes concurrent verifications mutually exclusive, including
  // synced passkeys whose signature counter remains zero. Cookie deletion alone
  // cannot invalidate a captured authentication request.
  const consumed = await db.prepare(
    `DELETE FROM passkey_authentication_challenges
     WHERE challenge = ? AND expires_at > ? RETURNING challenge`,
  ).bind(challenge, new Date().toISOString()).first<{ challenge: string }>()
  return consumed !== null
}
