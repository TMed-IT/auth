import { getSessionCookie } from '@/app/api/_auth/token'
import { generateSessionId, hashSessionId, isValidSessionId } from '@/lib/session-policy'
import type { D1Database } from '@/lib/server/d1'

export type StoredSession = {
  sessionHash: string
  userId: string
  expiresAt: string
}

export const createSession = async (
  db: D1Database,
  userId: string,
  maxAgeSeconds: number,
): Promise<string> => {
  const sessionId = generateSessionId()
  const sessionHash = await hashSessionId(sessionId)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + maxAgeSeconds * 1000).toISOString()

  await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now.toISOString()).run()
  await db.prepare(
    `INSERT INTO sessions(session_hash, user_id, expires_at, created_at)
     VALUES(?, ?, ?, ?)`,
  ).bind(sessionHash, userId, expiresAt, now.toISOString()).run()

  return sessionId
}

export const getSession = async (req: Request, db: D1Database): Promise<StoredSession | null> => {
  const sessionId = getSessionCookie(req)
  if (!sessionId || !isValidSessionId(sessionId)) return null

  const sessionHash = await hashSessionId(sessionId)
  const row = await db.prepare(
    `SELECT session_hash, user_id, expires_at
     FROM sessions WHERE session_hash = ? AND expires_at > ?`,
  ).bind(sessionHash, new Date().toISOString()).first<{
    session_hash: string
    user_id: string
    expires_at: string
  }>()

  return row ? {
    sessionHash: row.session_hash,
    userId: row.user_id,
    expiresAt: row.expires_at,
  } : null
}

export const revokeSession = async (db: D1Database, sessionHash: string): Promise<void> => {
  await db.prepare('DELETE FROM sessions WHERE session_hash = ?').bind(sessionHash).run()
}
