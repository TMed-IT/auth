import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { NextRequest, type NextResponse } from 'next/server.js'

import type { D1Database } from '../lib/server/d1.ts'
import {
  createSchemaDatabase,
  createServerLoader,
  setTestEnv,
} from './support/route-test-kit.ts'

const origin = 'https://auth.example.com'
const redirectUri = 'https://portal.example.com/_emdash/api/auth/callback'
const alternateRedirectUri = 'https://alt.example.com/_emdash/api/auth/callback'
const state = 's'.repeat(43)
const verifier = 'v'.repeat(43)

const setup = async (t: TestContext) => {
  const { sql, db } = createSchemaDatabase()
  t.after(() => sql.close())
  const settings = {
    AUTH_URL: origin,
    AUTH_TRUSTED_ORIGINS: 'portal,alt',
    NEXTJS_ENV: 'production',
    SESSION_MAX_AGE: '3600',
  }
  setTestEnv(t, settings)
  const env: Record<string, unknown> = { ...settings, DB: db }
  const load = createServerLoader(env)
  const { createSession } = load('lib/server/sessions.ts') as typeof import('../lib/server/sessions.ts')
  const { sha256Base64Url } = load('lib/server/emdash.ts') as typeof import('../lib/server/emdash.ts')
  const authorize = load('app/auth/emdash/authorize/route.ts') as {
    GET: (req: NextRequest) => Promise<NextResponse>
  }
  const token = load('app/auth/emdash/token/route.ts') as {
    POST: (req: NextRequest) => Promise<NextResponse>
  }
  const now = new Date().toISOString()
  sql.prepare('INSERT INTO users(id, email, display_name, created_at, consented_at) VALUES(?, ?, ?, ?, ?)')
    .run('approved', 'approved@example.com', 'Approved User', now, now)
  sql.prepare('INSERT INTO users(id, email, created_at) VALUES(?, ?, ?)')
    .run('pending', 'pending@example.com', now)
  const approvedSession = await createSession(db, 'approved', 3600)
  const pendingSession = await createSession(db, 'pending', 3600)

  const issue = async (session = approvedSession, callback = redirectUri) => {
    const url = new URL('/auth/emdash/authorize', origin)
    url.searchParams.set('redirect_uri', callback)
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', await sha256Base64Url(verifier))
    url.searchParams.set('code_challenge_method', 'S256')
    const response = await authorize.GET(new NextRequest(url, {
      headers: { cookie: `__Host-session=${session}` },
    }))
    return response
  }
  const exchange = (code: string, callback = redirectUri, codeVerifier = verifier) =>
    token.POST(new NextRequest(`${origin}/auth/emdash/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: callback, code_verifier: codeVerifier }),
    }))
  return { sql, db, env, issue, exchange, pendingSession }
}

test('EmDash 認可コードは指定 redirect URI で一度だけ交換できる', async (t) => {
  const { issue, exchange } = await setup(t)
  const issued = await issue()
  assert.equal(issued.status, 302)
  const location = new URL(issued.headers.get('location')!)
  assert.equal(location.origin + location.pathname, redirectUri)
  assert.equal(location.searchParams.get('state'), state)
  const code = location.searchParams.get('code')!
  assert.ok(code)

  const wrongRedirect = await exchange(code, alternateRedirectUri)
  assert.equal(wrongRedirect.status, 400)
  assert.deepEqual(await wrongRedirect.json(), { error: 'invalid_grant' })

  const exchanged = await exchange(code)
  assert.equal(exchanged.status, 200)
  assert.deepEqual(await exchanged.json(), {
    user: { id: 'approved', email: 'approved@example.com', name: 'Approved User' },
  })
  const replay = await exchange(code)
  assert.equal(replay.status, 400)
  assert.deepEqual(await replay.json(), { error: 'invalid_grant' })
})

test('誤った verifier と期限切れコードを拒否し、未同意ユーザーには発行しない', async (t) => {
  const { sql, issue, exchange, pendingSession } = await setup(t)
  const first = await issue()
  const firstCode = new URL(first.headers.get('location')!).searchParams.get('code')!
  const wrongVerifier = await exchange(firstCode, redirectUri, 'x'.repeat(43))
  assert.equal(wrongVerifier.status, 400)
  assert.deepEqual(await wrongVerifier.json(), { error: 'invalid_grant' })

  const second = await issue()
  const secondCode = new URL(second.headers.get('location')!).searchParams.get('code')!
  assert.ok(secondCode)
  sql.prepare('UPDATE emdash_authorization_codes SET expires_at = ?')
    .run('2000-01-01T00:00:00.000Z')
  const expired = await exchange(secondCode)
  assert.equal(expired.status, 400)
  assert.deepEqual(await expired.json(), { error: 'invalid_grant' })

  const pending = await issue(pendingSession)
  assert.equal(pending.status, 302)
  assert.equal(new URL(pending.headers.get('location')!).origin, origin)
  assert.equal(new URL(pending.headers.get('location')!).pathname, '/')
})

test('認可コード発行時の期限切れ清掃は一度に100件まで', async (t) => {
  const { sql, issue } = await setup(t)
  const insert = sql.prepare(
    `INSERT INTO emdash_authorization_codes
     (code_hash, user_id, redirect_uri, code_challenge, expires_at, created_at)
     VALUES(?, 'approved', ?, ?, '2000-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z')`,
  )
  for (let index = 0; index < 120; index++) {
    insert.run(`expired-${index}`, redirectUri, 'c'.repeat(43))
  }
  await issue()
  const count = sql.prepare("SELECT count(*) AS count FROM emdash_authorization_codes WHERE expires_at <= '2000-01-02'").get()!.count
  assert.equal(count, 20)
})

test('EmDash の DB 障害は認可画面と token API の所定のエラーになる', async (t) => {
  const { db, env, issue, exchange } = await setup(t)
  const originalError = console.error
  console.error = () => {}
  t.after(() => { console.error = originalError })

  const issued = await issue()
  const code = new URL(issued.headers.get('location')!).searchParams.get('code')!
  env.DB = { prepare: () => { throw new Error('D1 unavailable') } } satisfies D1Database
  const lookupError = await issue()
  const lookupLocation = new URL(lookupError.headers.get('location')!)
  assert.equal(lookupLocation.pathname, '/error')
  assert.equal(lookupLocation.searchParams.get('code'), 'database_error')

  env.DB = {
    prepare: (query) => {
      if (query.includes('INSERT INTO emdash_authorization_codes')) {
        throw new Error('D1 unavailable')
      }
      return db.prepare(query)
    },
  } satisfies D1Database
  const insertError = await issue()
  const insertLocation = new URL(insertError.headers.get('location')!)
  assert.equal(insertLocation.pathname, '/error')
  assert.equal(insertLocation.searchParams.get('code'), 'database_error')

  env.DB = { prepare: () => { throw new Error('D1 unavailable') } } satisfies D1Database
  const tokenError = await exchange(code)
  assert.equal(tokenError.status, 500)
  assert.deepEqual(await tokenError.json(), { error: 'database_error' })
  assert.equal(tokenError.headers.get('cache-control'), 'private, no-store')

  env.DB = db
  const recovered = await exchange(code)
  assert.equal(recovered.status, 200)
})
