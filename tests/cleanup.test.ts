import assert from 'node:assert/strict'
import test from 'node:test'

import { createSchemaDatabase, createServerLoader } from './support/route-test-kit.ts'

test('セッションとパスキーチャレンジの期限切れ清掃は各要求で100件まで', async (t) => {
  const { sql, db } = createSchemaDatabase()
  t.after(() => sql.close())
  const load = createServerLoader({})
  const { createSession } = load('lib/server/sessions.ts') as typeof import('../lib/server/sessions.ts')
  const { storeAuthenticationChallenge } = load('lib/server/passkey-challenges.ts') as
    typeof import('../lib/server/passkey-challenges.ts')
  const now = new Date().toISOString()
  const expired = '2000-01-01T00:00:00.000Z'
  sql.prepare('INSERT INTO users(id, email, created_at, consented_at) VALUES(?, ?, ?, ?)')
    .run('user-1', 'user@example.com', now, now)

  const insertSession = sql.prepare(
    'INSERT INTO sessions(session_hash, user_id, expires_at, created_at) VALUES(?, ?, ?, ?)',
  )
  const insertChallenge = sql.prepare(
    'INSERT INTO passkey_authentication_challenges(challenge, expires_at) VALUES(?, ?)',
  )
  for (let index = 0; index < 120; index++) {
    insertSession.run(`expired-${index}`, 'user-1', expired, expired)
    insertChallenge.run(`expired-${index}`, expired)
  }
  insertSession.run('still-valid', 'user-1', '2999-01-01T00:00:00.000Z', now)
  insertChallenge.run('still-valid', '2999-01-01T00:00:00.000Z')

  await createSession(db, 'user-1', 3600)
  await storeAuthenticationChallenge(db, 'new-challenge', 180)

  const expiredSessions = sql.prepare('SELECT count(*) AS count FROM sessions WHERE expires_at = ?')
    .get(expired)!.count
  const expiredChallenges = sql.prepare(
    'SELECT count(*) AS count FROM passkey_authentication_challenges WHERE expires_at = ?',
  ).get(expired)!.count
  assert.equal(expiredSessions, 20)
  assert.equal(expiredChallenges, 20)
  assert.equal(sql.prepare("SELECT count(*) AS count FROM sessions WHERE session_hash = 'still-valid'").get()!.count, 1)
  assert.equal(sql.prepare("SELECT count(*) AS count FROM passkey_authentication_challenges WHERE challenge = 'still-valid'").get()!.count, 1)
})
