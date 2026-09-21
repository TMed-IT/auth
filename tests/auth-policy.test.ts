import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

import externalConfig from '../config/external.ts'
import internalConfig from '../config/internal.ts'
import { decideUserAccess, getPasskeyAuthenticationQuery, getSessionUserQuery } from '../lib/auth-policy.ts'

test('外部は自己登録でき、内部は事前登録と同意が必要', () => {
  const external = externalConfig.auth.allowSelfRegistration
  const internal = internalConfig.auth.allowSelfRegistration
  assert.equal(decideUserAccess(null, external), 'consent')
  assert.equal(decideUserAccess({ id: 'existing', consented_at: null }, external), 'consent')
  assert.equal(decideUserAccess({ id: 'existing', consented_at: '2026-08-12' }, external), 'login')
  assert.equal(decideUserAccess(null, internal), 'reject')
  assert.equal(decideUserAccess({ id: null, consented_at: null }, internal), 'consent')
  assert.equal(decideUserAccess({ id: 'existing', consented_at: null }, internal), 'consent')
  assert.equal(decideUserAccess({ id: 'existing', consented_at: '2026-08-12' }, internal), 'login')
})

test('セッション・パスキー検索はサイト種別を問わず未同意ユーザーを返さない', (t) => {
  const db = new DatabaseSync(':memory:')
  t.after(() => db.close())
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  for (const [id, consent] of [['pending', null], ['approved', '2026-08-12']] as const) {
    db.prepare('INSERT INTO users(id, email, created_at, consented_at) VALUES(?, ?, ?, ?)')
      .run(id, `${id}@example.com`, '2026-08-12', consent)
    db.prepare(`INSERT INTO passkeys(
      credential_id, user_id, name, public_key, counter, device_type, backed_up, created_at
    ) VALUES(?, ?, 'Test', X'00', 0, 'multiDevice', 1, '2026-08-12')`).run(id, id)
    for (const query of [getSessionUserQuery, getPasskeyAuthenticationQuery]) {
      assert.equal(db.prepare(query()).get(id)?.id, consent ? id : undefined)
    }
  }
})
