import assert from 'node:assert/strict'
import test from 'node:test'

import { createServerLoader } from './support/route-test-kit.ts'

test('同じ Google 画像は24時間以内に再取得せず、変更・期限後に更新する', async (t) => {
  const { copyGoogleAvatarToR2 } = createServerLoader({})(
    'lib/server/avatars.ts',
  ) as typeof import('../lib/server/avatars.ts')
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let fetches = 0
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetches++
    const response = new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'content-type': 'image/png' },
    })
    Object.defineProperty(response, 'url', { value: String(input) })
    return response
  }) as typeof fetch

  let stored: { uploaded: Date; customMetadata: Record<string, string> } | null = null
  let writes = 0
  const bucket = {
    head: async () => stored,
    put: async (_key: string, _bytes: Uint8Array, options: {
      customMetadata: Record<string, string>
    }) => {
      writes++
      stored = { uploaded: new Date(), customMetadata: options.customMetadata }
      return stored
    },
  } as unknown as CloudflareEnv['AVATARS']
  const firstUrl = 'https://lh3.googleusercontent.com/avatar-one'
  const secondUrl = 'https://lh3.googleusercontent.com/avatar-two'

  const path = await copyGoogleAvatarToR2(bucket, 'User@Example.com', firstUrl)
  assert.match(path!, /^\/avatar\/[a-f0-9]{64}$/)
  assert.equal(await copyGoogleAvatarToR2(bucket, 'user@example.com', firstUrl), path)
  assert.equal(fetches, 1)
  assert.equal(writes, 1)

  await copyGoogleAvatarToR2(bucket, 'user@example.com', secondUrl)
  assert.equal(fetches, 2)
  assert.equal(writes, 2)

  const previous = stored as { uploaded: Date; customMetadata: Record<string, string> } | null
  assert.ok(previous)
  previous.uploaded = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  await copyGoogleAvatarToR2(bucket, 'user@example.com', secondUrl)
  assert.equal(fetches, 3)
  assert.equal(writes, 3)
})
