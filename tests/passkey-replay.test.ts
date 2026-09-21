import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import test, { type TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { isoCBOR } from '@simplewebauthn/server/helpers'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import type { NextResponse } from 'next/server'
import type { D1Database } from '../lib/server/d1.ts'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const origin = 'https://auth.example.com'
const userId = 'test-user'
const credentialId = randomBytes(32).toString('base64url')

// Run the actual routes and their helpers under Node without a Next.js server.
// Only the Cloudflare binding provider is replaced; SQL, cookies, signature
// verification, challenge consumption, and session creation all execute normally.
const createServerLoader = (env: Record<string, unknown>) => {
  const cache = new Map<string, { exports: Record<string, unknown> }>()
  const load = (file: string): Record<string, unknown> => {
    const filename = file.endsWith('.ts') ? file : `${file}.ts`
    const existing = cache.get(filename)
    if (existing) return existing.exports
    const loadedModule = { exports: {} }
    cache.set(filename, loadedModule)
    const nodeRequire = createRequire(filename)
    const requireModule = (id: string): unknown => {
      if (id === '@opennextjs/cloudflare') return { getCloudflareContext: () => ({ env }) }
      if (id === '@site-config') return load(resolve(projectRoot, 'config/external.ts'))
      if (id.startsWith('@/')) return load(resolve(projectRoot, id.slice(2)))
      if (id.startsWith('.')) return load(resolve(dirname(filename), id))
      return nodeRequire(id)
    }
    const { outputText } = transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, esModuleInterop: true },
      fileName: filename,
    })
    new Function('require', 'module', 'exports', outputText)(requireModule, loadedModule, loadedModule.exports)
    return loadedModule.exports
  }
  return (file: string) => load(resolve(projectRoot, file))
}

const setup = (t: TestContext) => {
  const sql = new DatabaseSync(':memory:')
  t.after(() => sql.close())
  sql.exec(readFileSync(resolve(projectRoot, 'schema.sql'), 'utf8'))
  const db: D1Database = {
    prepare: (query) => ({
      bind: (...values: unknown[]) => {
        const statement = sql.prepare(query)
        const args = values as SQLInputValue[]
        return {
          first: async <T>() => (statement.all(...args)[0] ?? null) as T | null,
          all: async <T>() => ({ results: statement.all(...args) as T[] }),
          run: async () => statement.run(...args),
        }
      },
    }),
  }
  const env = {
    AUTH_URL: origin,
    SESSION_MAX_AGE: '3600',
    TEMP_COOKIE_MAX_AGE: '180',
    ENCRYPTION_SECRET: randomBytes(48).toString('base64url'),
    CSRF_SECRET: randomBytes(48).toString('base64url'),
  }
  // token.ts also reads process.env for cookie lifetimes and the auth domain.
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key]
    process.env[key] = value
    t.after(() => {
      if (previous === undefined) delete process.env[key]
      else process.env[key] = previous
    })
  }

  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = publicKey.export({ format: 'jwk' })
  const cose = isoCBOR.encode(new Map<number, number | Uint8Array>([
    [1, 2], [3, -7], [-1, 1],
    [-2, Buffer.from(jwk.x!, 'base64url')],
    [-3, Buffer.from(jwk.y!, 'base64url')],
  ]))
  const now = new Date().toISOString()
  sql.prepare('INSERT INTO users(id, email, created_at, consented_at) VALUES(?, ?, ?, ?)')
    .run(userId, 'test@example.com', now, now)
  sql.prepare(`INSERT INTO passkeys(
    credential_id, user_id, name, public_key, counter, device_type, backed_up, created_at
  ) VALUES(?, ?, ?, ?, 0, 'multiDevice', 1, ?)`)
    .run(credentialId, userId, 'Test passkey', cose, now)

  const load = createServerLoader({ ...env, DB: db })
  type PostRoute = { POST: (req: Request) => Promise<NextResponse> }
  const options = load('app/auth/passkey/authentication/options/route.ts') as PostRoute
  const verify = load('app/auth/passkey/authentication/verify/route.ts') as PostRoute
  const { getSession } = load('lib/server/sessions.ts') as typeof import('../lib/server/sessions.ts')
  const request = (path: string, body: unknown, cookie = '') => new Request(`${origin}${path}`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })

  const issue = async () => {
    const response = await options.POST(request('/auth/passkey/authentication/options', {}))
    assert.equal(response.status, 200)
    const { challenge } = await response.json() as { challenge: string }
    const cookie = response.cookies.get('__Host-passkey_authentication')!
    assert.ok(cookie?.value)
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin }))
    const authenticatorData = Buffer.concat([
      createHash('sha256').update('auth.example.com').digest(),
      Buffer.from([0x1d]), // User present/verified, backup eligible/backed up.
      Buffer.alloc(4), // Synced passkey with a zero signature counter.
    ])
    const signature = sign('sha256', Buffer.concat([
      authenticatorData,
      createHash('sha256').update(clientData).digest(),
    ]), privateKey)
    const assertion: AuthenticationResponseJSON = {
      id: credentialId,
      rawId: credentialId,
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        authenticatorData: authenticatorData.toString('base64url'),
        clientDataJSON: clientData.toString('base64url'),
        signature: signature.toString('base64url'),
        userHandle: Buffer.from(userId).toString('base64url'),
      },
    }
    return {
      challenge,
      authenticate: () => verify.POST(request(
        '/auth/passkey/authentication/verify',
        { response: assertion },
        `${cookie.name}=${cookie.value}`,
      )),
    }
  }
  const sessionCount = () => sql.prepare('SELECT count(*) AS count FROM sessions').get()!.count
  const readSession = (cookie: string) => getSession(new Request(origin, { headers: { cookie } }), db)
  return { sql, issue, sessionCount, readSession }
}

test('counter=0でも認証リクエストの再送を拒否し、失効後にセッションを再発行しない', async (t) => {
  const { sql, issue, sessionCount, readSession } = setup(t)
  const { authenticate } = await issue()
  const first = await authenticate()
  assert.equal(first.status, 200)
  const sessionId = first.cookies.get('__Host-session')?.value
  assert.ok(sessionId)
  const sessionCookie = `__Host-session=${sessionId}`
  const session = await readSession(sessionCookie)
  assert.equal(session?.userId, userId)
  assert.notEqual(session?.sessionHash, sessionId)
  assert.equal(sessionCount(), 1)

  // Equivalent to revoking the only session at logout; retain the old request.
  sql.exec('DELETE FROM sessions')
  assert.equal(await readSession(sessionCookie), null)
  const replay = await authenticate()
  assert.equal(replay.status, 400)
  assert.deepEqual(await replay.json(), { error: 'invalid_challenge' })
  assert.equal(sessionCount(), 0)
})

test('同じパスキーチャレンジの同時送信は1件だけセッションを発行する', async (t) => {
  const { issue, sessionCount } = setup(t)
  const { authenticate } = await issue()
  const responses = await Promise.all([authenticate(), authenticate()])
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 400])
  assert.equal(sessionCount(), 1)
})

test('Cookieが有効でもD1で期限切れまたは未登録のチャレンジは拒否する', async (t) => {
  const { sql, issue, sessionCount } = setup(t)
  const expired = await issue()
  sql.prepare('UPDATE passkey_authentication_challenges SET expires_at = ? WHERE challenge = ?')
    .run('2000-01-01T00:00:00.000Z', expired.challenge)
  const expiredResponse = await expired.authenticate()
  assert.equal(expiredResponse.status, 400)
  assert.deepEqual(await expiredResponse.json(), { error: 'invalid_challenge' })

  const missing = await issue()
  sql.prepare('DELETE FROM passkey_authentication_challenges WHERE challenge = ?').run(missing.challenge)
  const missingResponse = await missing.authenticate()
  assert.equal(missingResponse.status, 400)
  assert.deepEqual(await missingResponse.json(), { error: 'invalid_challenge' })
  assert.equal(sessionCount(), 0)
})
