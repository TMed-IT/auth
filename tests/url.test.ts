import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getAllowedAuthOrigins,
  getDefaultRedirectUrl,
  getTrustedAuthOrigin,
  getTrustedFrontendOrigins,
  trustedRedirectOrNull,
  trustedRedirectOrFallback,
} from '../lib/server/url.ts'

test('ローカルのAUTH_URLはポートを維持する', () => {
  const env = {
    AUTH_URL: 'http://localhost:3001',
    NEXTJS_ENV: 'development',
  }

  assert.equal(getTrustedAuthOrigin(env), 'http://localhost:3001')
  assert.equal(getDefaultRedirectUrl(env), 'http://localhost:3001/')
  assert.deepEqual(getTrustedFrontendOrigins(env), ['http://localhost:3001'])
})

test('開発環境では127.0.0.1もローカルOriginとして扱う', () => {
  const env = {
    AUTH_URL: 'http://127.0.0.1:3000',
    NEXTJS_ENV: 'development',
  }

  assert.equal(getTrustedAuthOrigin(env), 'http://127.0.0.1:3000')
  assert.equal(getDefaultRedirectUrl(env), 'http://127.0.0.1:3000/')
})

test('pnpm run devでは任意ポートのlocalhostを許可する', () => {
  const env = {
    AUTH_URL: 'http://localhost:3000',
    AUTH_ALLOW_ANY_LOCALHOST_REDIRECT: 'true',
    NEXTJS_ENV: 'development',
  }

  assert.equal(
    trustedRedirectOrNull('http://localhost:5173/dashboard?tab=profile', env),
    'http://localhost:5173/dashboard?tab=profile',
  )
  assert.deepEqual(
    getAllowedAuthOrigins(
      env,
      new Request('http://localhost:3000/me', {
        headers: { origin: 'http://localhost:8080' },
      }),
    ),
    ['http://localhost:3000', 'http://localhost:8080'],
  )
})

test('本番環境ではHTTPのローカルOriginを拒否する', () => {
  const env = {
    AUTH_URL: 'http://localhost:3000',
    NEXTJS_ENV: 'production',
  }

  assert.equal(getTrustedAuthOrigin(env), null)
  assert.throws(() => getDefaultRedirectUrl(env))
})

test('環境変数で指定したURLを戻り元がない場合の遷移先にする', () => {
  const env = {
    AUTH_URL: 'https://auth.example.com',
    AUTH_DEFAULT_REDIRECT_URL: 'https://portal.example.net/welcome?from=auth',
    NEXTJS_ENV: 'production',
  }

  assert.equal(
    getDefaultRedirectUrl(env),
    'https://portal.example.net/welcome?from=auth',
  )
  assert.equal(
    trustedRedirectOrFallback(null, env),
    'https://portal.example.net/welcome?from=auth',
  )
  assert.deepEqual(getTrustedFrontendOrigins(env), ['https://portal.example.net'])
})

test('本番環境では安全でないデフォルトリダイレクトURLを拒否する', () => {
  const env = {
    AUTH_URL: 'https://auth.example.com',
    AUTH_DEFAULT_REDIRECT_URL: 'http://portal.example.com/',
    NEXTJS_ENV: 'production',
  }

  assert.throws(() => getDefaultRedirectUrl(env), /AUTH_DEFAULT_REDIRECT_URL/)
})
