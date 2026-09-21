import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getAvatarHash,
  isGoogleAvatarUrl,
  normalizeAvatarPath,
} from '../lib/avatar.ts'

const avatarHash = 'b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514'
const avatarPath = `/avatar/${avatarHash}`

test('メールアドレスを正規化して1ユーザーにつき1つのR2キーを作る', async () => {
  const hash = await getAvatarHash('User@Example.com')
  assert.equal(hash, await getAvatarHash(' user@example.com '))
  assert.match(hash, /^[a-f0-9]{64}$/)
})

test('R2配信用のアバターパスだけを受け付ける', () => {
  assert.equal(normalizeAvatarPath(avatarPath), avatarPath)
  assert.equal(normalizeAvatarPath('https://lh3.googleusercontent.com/avatar.jpg'), null)
  assert.equal(normalizeAvatarPath('/avatar/not-a-hash'), null)
})

test('GoogleのHTTPS画像ホストだけをコピー元として受け付ける', () => {
  assert.equal(isGoogleAvatarUrl('https://lh3.googleusercontent.com/a/photo'), true)
  assert.equal(isGoogleAvatarUrl('http://lh3.googleusercontent.com/a/photo'), false)
  assert.equal(isGoogleAvatarUrl('https://googleusercontent.com.evil.example/a/photo'), false)
  assert.equal(isGoogleAvatarUrl('https://user@googleusercontent.com/a/photo'), false)
})
