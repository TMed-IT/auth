import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getDefaultPasskeyName,
  isRegistrationStateForUser,
  normalizePasskeyName,
  parseRegistrationState,
} from '../lib/passkey-policy.ts'
import { isValidCodeVerifier, sha256Base64Url, verifyCodeChallenge } from '../lib/server/emdash.ts'
import { trustedAuthFlowRedirectOrNull, trustedEmDashContinuationOrNull } from '../lib/server/url.ts'
import { createPasskeyAuthenticationOptions, createPasskeyRegistrationOptions } from '../lib/webauthn-options.ts'

const env = { AUTH_URL: 'https://auth.example.com', AUTH_TRUSTED_ORIGINS: 'portal', NEXTJS_ENV: 'production' }

test('登録・認証にはユーザー検証を要求し、発見可能なパスキーを使う', async () => {
  const registration = await createPasskeyRegistrationOptions({
    rpName: 'TMed-IT Auth', rpID: 'auth.example.com',
    userId: new TextEncoder().encode('user-123'), userName: 'user-123', userDisplayName: 'Test User',
    excludeCredentials: [],
  })
  assert.equal(registration.authenticatorSelection?.residentKey, 'required')
  assert.equal(registration.authenticatorSelection?.userVerification, 'required')
  assert.equal(registration.attestation, 'none')
  const authentication = await createPasskeyAuthenticationOptions('auth.example.com')
  assert.equal(authentication.userVerification, 'required')
  assert.equal(authentication.allowCredentials, undefined)
})

test('登録チャレンジは発行した本人だけが利用できる', () => {
  const state = parseRegistrationState(JSON.stringify({
    challenge: 'challenge', userId: 'user-a', redirect: 'https://portal.example.com/',
  }))
  assert.equal(isRegistrationStateForUser(state, 'user-a'), true)
  assert.equal(isRegistrationStateForUser(state, 'user-b'), false)
  assert.equal(parseRegistrationState('{"challenge":"challenge"}'), null)
})

test('登録環境からパスキーの初期名を決め、後から付ける名前を検証する', () => {
  const platformRegistration = {
    authenticatorAttachment: 'platform',
    response: { transports: ['internal'] },
  }
  assert.equal(
    getDefaultPasskeyName(platformRegistration, 'Mozilla/5.0 (Macintosh; Intel Mac OS X)'),
    'iCloud Keychain',
  )
  assert.equal(
    getDefaultPasskeyName(platformRegistration, 'Mozilla/5.0 (Windows NT 10.0)'),
    'Windows Hello',
  )
  assert.equal(
    getDefaultPasskeyName(platformRegistration, 'Mozilla/5.0 (Linux; Android 16)'),
    'Google Password Manager',
  )
  assert.equal(
    getDefaultPasskeyName({ response: { transports: ['usb'] } }, null),
    'セキュリティキー',
  )
  assert.equal(normalizePasskeyName('  個人用  '), '個人用')
  assert.equal(normalizePasskeyName(''), null)
  assert.equal(normalizePasskeyName('a'.repeat(65)), null)
})

test('ログイン後の戻り先は許可サイトと安全な登録継続URLに限定する', () => {
  const continuation = 'https://auth.example.com/passkey?redirect=https%3A%2F%2Fportal.example.com%2Fsettings'
  for (const url of ['https://portal.example.com/dashboard?tab=security', continuation]) {
    assert.equal(trustedAuthFlowRedirectOrNull(url, env), url)
  }
  for (const url of [
    'https://evil.example.net/',
    'http://portal.example.com/',
    'https://user:password@portal.example.com/',
    'https://auth.example.com/consent',
    'https://auth.example.com/passkey?next=/admin',
    'https://auth.example.com/passkey?redirect=https%3A%2F%2Fevil.example.net%2F',
    `${continuation}&redirect=https%3A%2F%2Fportal.example.com%2F`,
  ]) assert.equal(trustedAuthFlowRedirectOrNull(url, env), null, url)
})

test('EmDash認可は許可済みcallbackとS256 PKCEだけを受け付ける', () => {
  const authorize = new URL('/auth/emdash/authorize', env.AUTH_URL)
  const params = {
    redirect_uri: 'https://portal.example.com/_emdash/api/auth/callback',
    state: 's'.repeat(43), code_challenge: 'c'.repeat(43), code_challenge_method: 'S256',
  }
  authorize.search = new URLSearchParams(params).toString()
  assert.equal(trustedAuthFlowRedirectOrNull(authorize.toString(), env), authorize.toString())
  for (const [key, value] of [
    ['redirect_uri', 'https://evil.example.net/_emdash/api/auth/callback'],
    ['redirect_uri', 'https://portal.example.com/other-callback'],
    ['code_challenge_method', 'plain'],
    ['state', 'short'],
  ]) {
    const invalid = new URL(authorize)
    invalid.searchParams.set(key, value)
    assert.equal(trustedEmDashContinuationOrNull(invalid.toString(), env), null)
  }
})

test('EmDashコード交換は一致するPKCE verifierだけを許可する', async () => {
  const verifier = 'v'.repeat(43)
  const challenge = await sha256Base64Url(verifier)
  assert.equal(isValidCodeVerifier(verifier), true)
  assert.equal(isValidCodeVerifier('short'), false)
  assert.equal(await verifyCodeChallenge(verifier, challenge), true)
  assert.equal(await verifyCodeChallenge('x'.repeat(43), challenge), false)
})
