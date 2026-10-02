import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { NextRequest, NextResponse } from 'next/server.js'

import externalConfig from '../config/external.ts'
import internalConfig from '../config/internal.ts'
import type { D1Database } from '../lib/server/d1.ts'
import {
  cookieHeader,
  createSchemaDatabase,
  createServerLoader,
  setTestEnv,
} from './support/route-test-kit.ts'

const origin = 'https://auth.example.com'
const frontend = 'https://portal.example.com'

const baseEnv = () => ({
  AUTH_URL: origin,
  AUTH_TRUSTED_ORIGINS: 'portal',
  NEXTJS_ENV: 'production',
  SESSION_MAX_AGE: '3600',
  TEMP_COOKIE_MAX_AGE: '180',
  GOOGLE_CLIENT_ID: 'test-client',
  GOOGLE_CLIENT_SECRET: 'test-secret',
  ENCRYPTION_SECRET: randomBytes(48).toString('base64url'),
  CSRF_SECRET: randomBytes(48).toString('base64url'),
})

test('内部サイトの未登録拒否と事前登録ユーザーの同意・セッション発行', async (t) => {
  const { sql, db } = createSchemaDatabase()
  t.after(() => sql.close())
  const settings = baseEnv()
  setTestEnv(t, settings)
  const env = { ...settings, DB: db, AVATARS: {} }
  let email = 'unlisted@example.com'
  const load = createServerLoader(env, 'internal', {
    '@site-config': { __esModule: true, default: internalConfig },
    '@/app/api/_auth/auth': {
      exchangeCodeForToken: async () => ({ accessToken: 'access', idToken: 'id' }),
      verifyGoogleIdToken: async () => ({ sub: 'google-user', email }),
      getGoogleUserInfo: async () => ({
        id: 'google-user', email, emailVerified: true, name: 'Test User',
      }),
    },
  })
  const { setTempCookie } = load('app/api/_auth/token.ts') as typeof import('../app/api/_auth/token.ts')
  const callback = load('app/auth/callback/google/route.ts') as {
    GET: (req: NextRequest) => Promise<NextResponse>
  }
  const consent = load('app/auth/consent/route.ts') as {
    GET: (req: NextRequest) => Promise<NextResponse>
    POST: (req: NextRequest) => Promise<NextResponse>
  }

  const oauthCookies = NextResponse.json({})
  setTempCookie(oauthCookies.cookies, 'oauth_state', 'state', 180)
  setTempCookie(oauthCookies.cookies, 'oauth_nonce', 'nonce', 180)
  setTempCookie(oauthCookies.cookies, 'pkce_verifier', 'verifier', 180)
  const callbackRequest = () => new NextRequest(`${origin}/auth/callback/google?code=code&state=state`, {
    headers: { cookie: cookieHeader(oauthCookies) },
  })

  const rejected = await callback.GET(callbackRequest())
  assert.equal(new URL(rejected.headers.get('location')!).searchParams.get('code'), 'email_not_allowlisted')
  assert.equal(sql.prepare('SELECT count(*) AS count FROM sessions').get()!.count, 0)

  email = 'allowlisted@example.com'
  const allowlistedId = 'allowlisted-user'
  sql.prepare("INSERT INTO users(id, email, created_at) VALUES(?, ?, datetime('now'))")
    .run(allowlistedId, email)
  const approved = await callback.GET(callbackRequest())
  assert.equal(approved.headers.get('location'), `${origin}/consent`)
  const pendingCookie = cookieHeader(approved)
  assert.match(pendingCookie, /__Host-pending_user=/)

  const prepared = await consent.GET(new NextRequest(`${origin}/auth/consent`, {
    headers: { cookie: pendingCookie },
  }))
  assert.equal(prepared.status, 200)
  const { csrfToken } = await prepared.json() as { csrfToken: string }
  const requestCookies = cookieHeader(approved, prepared)
  const nullBody = await consent.POST(new NextRequest(`${origin}/auth/consent`, {
    method: 'POST',
    headers: { origin, cookie: requestCookies, 'content-type': 'application/json' },
    body: 'null',
  }))
  assert.equal(nullBody.status, 400)
  assert.deepEqual(await nullBody.json(), { error: 'consent_required' })
  const consentRequest = () => new NextRequest(`${origin}/auth/consent`, {
    method: 'POST',
    headers: { origin, cookie: requestCookies, 'content-type': 'application/json' },
    body: JSON.stringify({ csrfToken, agreedToTerms: true, agreedToPrivacy: true }),
  })
  const responses = await Promise.all([
    consent.POST(consentRequest()),
    consent.POST(consentRequest()),
  ])
  assert.deepEqual(responses.map((response) => response.status), [200, 200])
  const user = sql.prepare('SELECT id, consented_at FROM users WHERE email = ?').get(email) as {
    id: string
    consented_at: string
  }
  assert.equal(user.id, allowlistedId)
  assert.ok(user.consented_at)
  const sessions = sql.prepare('SELECT DISTINCT user_id FROM sessions').all() as { user_id: string }[]
  assert.deepEqual(sessions.map((session) => session.user_id), [user.id])
})

test('外部サイトの同時同意は同じユーザー ID で両方のセッションを発行する', { timeout: 10000 }, async (t) => {
  const { sql, db } = createSchemaDatabase()
  t.after(() => sql.close())
  const settings = baseEnv()
  setTestEnv(t, settings)
  let releaseReads!: () => void
  const bothReads = new Promise<void>((resolve) => { releaseReads = resolve })
  let reads = 0
  const concurrentDb: D1Database = {
    prepare: (query) => {
      const statement = db.prepare(query)
      if (!query.startsWith('SELECT id, email, given_name')) return statement
      return {
        bind: (...values) => {
          const bound = statement.bind(...values)
          return {
            ...bound,
            first: async <T>() => {
              const result = await bound.first<T>()
              reads += 1
              if (reads === 2) releaseReads()
              await bothReads
              return result
            },
          }
        },
      }
    },
  }
  const load = createServerLoader({ ...settings, DB: concurrentDb }, 'external', {
    '@site-config': { __esModule: true, default: externalConfig },
  })
  const { setEncryptedTempCookie } = load('app/api/_auth/token.ts') as typeof import('../app/api/_auth/token.ts')
  const consent = load('app/auth/consent/route.ts') as {
    GET: (req: NextRequest) => Promise<NextResponse>
    POST: (req: NextRequest) => Promise<NextResponse>
  }
  const pendingResponse = NextResponse.json({})
  await setEncryptedTempCookie(pendingResponse.cookies, 'pending_user', JSON.stringify({
    email: 'new@example.com', given_name: 'New', family_name: 'User',
  }), 180)
  const prepared = await consent.GET(new NextRequest(`${origin}/auth/consent`, {
    headers: { cookie: cookieHeader(pendingResponse) },
  }))
  const { csrfToken } = await prepared.json() as { csrfToken: string }
  const cookies = cookieHeader(pendingResponse, prepared)
  const request = () => new NextRequest(`${origin}/auth/consent`, {
    method: 'POST',
    headers: { origin, cookie: cookies, 'content-type': 'application/json' },
    body: JSON.stringify({ csrfToken, agreedToTerms: true, agreedToPrivacy: true }),
  })
  const responses = await Promise.all([consent.POST(request()), consent.POST(request())])
  assert.equal(reads, 2)
  assert.deepEqual(responses.map((response) => response.status), [200, 200])
  assert.equal(sql.prepare('SELECT count(*) AS count FROM users WHERE email = ?')
    .get('new@example.com')!.count, 1)
  const user = sql.prepare('SELECT id FROM users WHERE email = ?')
    .get('new@example.com') as { id: string }
  const sessions = sql.prepare('SELECT user_id FROM sessions').all() as { user_id: string }[]
  assert.deepEqual(sessions.map((session) => session.user_id), [user.id, user.id])
})

test('認証 API は JSON null を通常の入力として処理する', async (t) => {
  const { sql, db } = createSchemaDatabase()
  t.after(() => sql.close())
  const settings = baseEnv()
  setTestEnv(t, settings)
  const load = createServerLoader({ ...settings, DB: db }, 'external', {
    '@site-config': { __esModule: true, default: externalConfig },
  })
  const { createSession } = load('lib/server/sessions.ts') as typeof import('../lib/server/sessions.ts')
  const now = new Date().toISOString()
  sql.prepare('INSERT INTO users(id, email, created_at, consented_at) VALUES(?, ?, ?, ?)')
    .run('user-1', 'user@example.com', now, now)
  const sessionId = await createSession(db, 'user-1', 3600)
  const routes = [
    { path: '/auth/signin/google', file: 'app/auth/signin/google/route.ts', status: 200 },
    { path: '/auth/passkey/registration/options', file: 'app/auth/passkey/registration/options/route.ts', status: 200 },
    { path: '/auth/passkey/authentication/options', file: 'app/auth/passkey/authentication/options/route.ts', status: 200 },
    { path: '/auth/signout', file: 'app/auth/signout/route.ts', status: 403 },
  ]
  for (const route of routes) {
    const handler = load(route.file) as { POST: (req: NextRequest) => Promise<NextResponse> }
    const response = await handler.POST(new NextRequest(`${origin}${route.path}`, {
      method: 'POST',
      headers: {
        origin,
        cookie: `__Host-session=${sessionId}`,
        'content-type': 'application/json',
      },
      body: 'null',
    }))
    assert.equal(response.status, route.status, route.path)
    if (route.path === '/auth/signout') {
      assert.deepEqual(await response.json(), { error: 'csrf_token_invalid' })
      assert.equal(response.headers.get('access-control-allow-origin'), origin)
      assert.equal(sql.prepare('SELECT count(*) AS count FROM sessions').get()!.count, 1)
    }
  }
})

test('/me は検証済み戻り先を返し、DB エラーにも CORS を付ける', async (t) => {
  const { sql, db } = createSchemaDatabase()
  t.after(() => sql.close())
  const settings = baseEnv()
  setTestEnv(t, settings)
  const load = createServerLoader({ ...settings, DB: db })
  const { createSession } = load('lib/server/sessions.ts') as typeof import('../lib/server/sessions.ts')
  const me = load('app/me/route.ts') as { GET: (req: NextRequest) => Promise<NextResponse> }
  const now = new Date().toISOString()
  sql.prepare('INSERT INTO users(id, email, created_at, consented_at) VALUES(?, ?, ?, ?)')
    .run('user-1', 'user@example.com', now, now)
  const sessionId = await createSession(db, 'user-1', 3600)
  const request = (redirect: string) => new NextRequest(
    `${origin}/me?redirect=${encodeURIComponent(redirect)}`,
    { headers: { cookie: `__Host-session=${sessionId}`, origin: frontend } },
  )
  const allowed = await me.GET(request(`${frontend}/settings`))
  assert.equal(allowed.status, 200)
  assert.equal((await allowed.json() as { redirectUrl: string | null }).redirectUrl, `${frontend}/settings`)
  const disallowed = await me.GET(request('https://evil.example.net/'))
  assert.equal((await disallowed.json() as { redirectUrl: string | null }).redirectUrl, null)

  const missingDbMe = createServerLoader(settings)('app/me/route.ts') as {
    GET: (req: NextRequest) => Promise<NextResponse>
  }
  const error = await missingDbMe.GET(request(`${frontend}/settings`))
  assert.equal(error.status, 500)
  assert.equal(error.headers.get('access-control-allow-origin'), frontend)
  assert.equal(error.headers.get('access-control-allow-credentials'), 'true')

  const originalError = console.error
  console.error = () => {}
  try {
    const failingDbMe = createServerLoader({
      ...settings,
      DB: { prepare: () => { throw new Error('D1 unavailable') } } satisfies D1Database,
    })('app/me/route.ts') as { GET: (req: NextRequest) => Promise<NextResponse> }
    const lookupError = await failingDbMe.GET(request(`${frontend}/settings`))
    assert.equal(lookupError.status, 500)
    assert.equal(lookupError.headers.get('access-control-allow-origin'), frontend)
  } finally {
    console.error = originalError
  }
})

test('サインアウト POST の DB 例外は JSON と CORS 付き 500 になる', async (t) => {
  const originalError = console.error
  console.error = () => {}
  t.after(() => { console.error = originalError })
  const { sql, db } = createSchemaDatabase()
  t.after(() => sql.close())
  const settings = baseEnv()
  setTestEnv(t, settings)
  const env: Record<string, unknown> = { ...settings, DB: db }
  const load = createServerLoader(env)
  const { createSession } = load('lib/server/sessions.ts') as typeof import('../lib/server/sessions.ts')
  const signout = load('app/auth/signout/route.ts') as {
    GET: (req: NextRequest) => Promise<NextResponse>
    POST: (req: NextRequest) => Promise<NextResponse>
  }
  const now = new Date().toISOString()
  sql.prepare('INSERT INTO users(id, email, created_at, consented_at) VALUES(?, ?, ?, ?)')
    .run('user-1', 'user@example.com', now, now)
  const sessionId = await createSession(db, 'user-1', 3600)
  const sessionCookie = `__Host-session=${sessionId}`
  const getRequest = () => new NextRequest(`${origin}/auth/signout`, {
    headers: { origin: frontend, cookie: sessionCookie },
  })
  const postRequest = (cookies: string, csrfToken: string) => new NextRequest(
    `${origin}/auth/signout`, {
      method: 'POST',
      headers: { origin: frontend, cookie: cookies, 'content-type': 'application/json' },
      body: JSON.stringify({ csrfToken }),
    },
  )

  env.DB = { prepare: () => { throw new Error('D1 unavailable') } } satisfies D1Database
  const lookupError = await signout.POST(postRequest(sessionCookie, 'unused'))
  assert.equal(lookupError.status, 500)
  assert.deepEqual(await lookupError.json(), { error: 'database_error' })
  assert.equal(lookupError.headers.get('access-control-allow-origin'), frontend)

  env.DB = db
  const prepared = await signout.GET(getRequest())
  const { csrfToken } = await prepared.json() as { csrfToken: string }
  const cookies = `${sessionCookie}; ${cookieHeader(prepared)}`
  env.DB = {
    prepare: (query: string) => {
      if (query === 'DELETE FROM sessions WHERE session_hash = ?') throw new Error('D1 unavailable')
      return db.prepare(query)
    },
  } satisfies D1Database
  const revokeError = await signout.POST(postRequest(cookies, csrfToken))
  assert.equal(revokeError.status, 500)
  assert.deepEqual(await revokeError.json(), { error: 'database_error' })
  assert.equal(revokeError.headers.get('access-control-allow-origin'), frontend)
})

test('遷移付き GET サインアウトはログインと同じ送信元制限を通った場合だけ失効する', async (t) => {
  const { sql, db } = createSchemaDatabase()
  t.after(() => sql.close())
  const settings = baseEnv()
  setTestEnv(t, settings)
  const load = createServerLoader({ ...settings, DB: db })
  const { createSession } = load('lib/server/sessions.ts') as typeof import('../lib/server/sessions.ts')
  const signout = load('app/auth/signout/route.ts') as {
    GET: (req: NextRequest) => Promise<NextResponse>
  }
  const now = new Date().toISOString()
  sql.prepare('INSERT INTO users(id, email, created_at, consented_at) VALUES(?, ?, ?, ?)')
    .run('user-1', 'user@example.com', now, now)
  const sessionId = await createSession(db, 'user-1', 3600)
  const sessionCount = () => sql.prepare('SELECT count(*) AS count FROM sessions').get()!.count
  const signoutUrl = `${origin}/auth/signout?redirect=${encodeURIComponent(`${frontend}/after`)}`
  const request = (headers: Record<string, string> = {}) => new NextRequest(signoutUrl, {
    headers: { cookie: `__Host-session=${sessionId}`, ...headers },
  })

  const rejectedHeaders: Record<string, string>[] = [
    {},
    { referer: 'https://evil.example.net/page' },
    { origin: 'https://evil.example.net', referer: `${frontend}/page` },
  ]
  for (const headers of rejectedHeaders) {
    const rejected = await signout.GET(request(headers))
    assert.equal(rejected.status, 403)
    assert.deepEqual(await rejected.json(), { error: 'invalid_origin' })
    assert.equal(sessionCount(), 1)
    assert.equal(rejected.cookies.get('__Host-session'), undefined)
  }

  const allowed = await signout.GET(request({ referer: `${frontend}/page` }))
  assert.equal(allowed.status, 303)
  assert.equal(allowed.headers.get('location'), `${frontend}/after`)
  assert.equal(sessionCount(), 0)
})
