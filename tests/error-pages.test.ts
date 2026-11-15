import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest, type NextResponse } from 'next/server.js'
import externalConfig from '../config/external.ts'
import { createServerLoader, setTestEnv } from './support/route-test-kit.ts'

test('エラーメッセージは定義済みのキーだけを使用する', () => {
  const errors = createServerLoader({}, 'external', {
    '@site-config': { __esModule: true, default: externalConfig },
  })('lib/error.ts') as typeof import('../lib/error.ts')
  for (const key of ['unknown', 'constructor', 'toString', '__proto__']) {
    assert.equal(errors.getErrorMessage(key), null)
    assert.equal(errors.getErrorDetailMessage(key), null)
  }
  assert.equal(typeof errors.getErrorMessage('oauth_error'), 'string')
})

test('Google コールバックの想定外エラーは詳細を返さずエラー画面へ遷移する', async (t) => {
  const originalError = console.error
  console.error = () => {}
  t.after(() => { console.error = originalError })
  const callback = createServerLoader({}, 'external', {
    '@site-config': { __esModule: true, default: externalConfig },
  })('app/auth/callback/google/route.ts') as {
    GET: (req: NextRequest) => Promise<NextResponse>
  }
  const response = await callback.GET(new NextRequest('https://auth.example.com/auth/callback/google'))
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), 'https://auth.example.com/error?key=oauth_error')
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(await response.text(), '')
})

test('ブラウザでのログアウト失敗は画面へ遷移し、API は JSON を返す', async (t) => {
  const env = {
    AUTH_URL: 'https://auth.example.com',
    AUTH_TRUSTED_ORIGINS: 'portal',
    NEXTJS_ENV: 'production',
  }
  setTestEnv(t, env)
  const signout = createServerLoader(env)('app/auth/signout/route.ts') as {
    GET: (req: NextRequest) => Promise<NextResponse>
  }
  const response = await signout.GET(new NextRequest('https://auth.example.com/auth/signout', {
    headers: { accept: 'text/html' },
  }))
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), 'https://auth.example.com/error?key=authorization_error&code=database_error')
  assert.equal(await response.text(), '')

  const apiResponse = await signout.GET(new NextRequest('https://auth.example.com/auth/signout'))
  assert.equal(apiResponse.status, 500)
  assert.deepEqual(await apiResponse.json(), { error: 'database_error' })
})
