import type { D1Database } from './d1'

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const hashAuthenticationChallenge = async (challenge: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(challenge))
  return bytesToBase64Url(new Uint8Array(digest))
}

export const markAuthenticationChallengeConsumed = async (
  db: D1Database,
  challenge: string,
  maxAgeSeconds: number,
): Promise<boolean> => {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + maxAgeSeconds * 1000).toISOString()
  const challengeHash = await hashAuthenticationChallenge(challenge)

  await db.prepare(`DELETE FROM passkey_consumed_challenges WHERE challenge_hash IN (
    SELECT challenge_hash FROM passkey_consumed_challenges
    WHERE expires_at <= ? ORDER BY expires_at LIMIT 100
  )`)
    .bind(now.toISOString()).run()
  const consumed = await db.prepare(
    `INSERT INTO passkey_consumed_challenges(challenge_hash, expires_at)
     VALUES(?, ?)
     ON CONFLICT(challenge_hash) DO NOTHING
     RETURNING challenge_hash`,
  ).bind(challengeHash, expiresAt).first<{ challenge_hash: string }>()
  return consumed !== null
}
