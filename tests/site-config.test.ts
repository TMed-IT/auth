import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const script = resolve(dirname(fileURLToPath(import.meta.url)), '../scripts/site-config.mjs')

const generateConfig = (site: 'external' | 'internal', authUrl: string) => {
  const directory = mkdtempSync(join(tmpdir(), 'auth-site-config-'))
  try {
    const result = spawnSync(process.execPath, [script, site], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        AUTH_URL: authUrl,
        SESSION_MAX_AGE: '3600',
        GOOGLE_CLIENT_ID: 'test-client',
        D1_DATABASE_NAME: 'test-auth',
        D1_DATABASE_ID: 'test-database-id',
        R2_AVATAR_BUCKET_NAME: 'test-auth',
        AUTH_EMAIL_ALLOW_REGEX: '@example\\.com$',
      },
    })
    assert.equal(result.status, 0, result.stderr)
    return JSON.parse(readFileSync(join(directory, `.wrangler.${site}.jsonc`), 'utf8'))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('本番の認証ホストは Custom Domain として生成する', () => {
  for (const [site, authUrl] of [
    ['internal', 'https://auth.tmedit.org'],
    ['external', 'https://auth.example.com'],
  ] as const) {
    const config = generateConfig(site, authUrl)
    assert.equal(config.workers_dev, false)
    assert.deepEqual(config.routes, [{
      pattern: new URL(authUrl).hostname,
      custom_domain: true,
    }])
  }
})

test('ローカル開発では Custom Domain を生成しない', () => {
  const config = generateConfig('internal', 'http://localhost:3001')
  assert.equal(config.workers_dev, true)
  assert.equal(config.routes, undefined)
})
