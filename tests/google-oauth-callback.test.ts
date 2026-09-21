import assert from 'node:assert/strict'
import test from 'node:test'

import { validateGoogleOAuthCallback } from '../lib/google-oauth-callback.ts'

const validInput = {
  code: 'authorization-code',
  state: 'expected-state',
  providerError: null,
  storedState: 'expected-state',
  storedNonce: 'expected-nonce',
  storedVerifier: 'expected-verifier',
}

test('Googleで共有を拒否した場合はキャンセルとして扱う', () => {
  assert.deepEqual(
    validateGoogleOAuthCallback({
      ...validInput,
      code: null,
      providerError: 'access_denied',
    }),
    { ok: false, error: 'access_denied' },
  )
})

test('OAuthエラーでもstateが一致しなければ不正なコールバックとして扱う', () => {
  assert.deepEqual(
    validateGoogleOAuthCallback({
      ...validInput,
      code: null,
      state: 'unexpected-state',
      providerError: 'access_denied',
    }),
    { ok: false, error: 'invalid_state' },
  )
})
