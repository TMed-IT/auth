import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ESLint } from 'eslint'

test('Next.jsのESLintルールはglobで指定したルート内のページを検出する', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'auth-eslint-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const pages = join(directory, 'site-example', 'pages')
  mkdirSync(pages, { recursive: true })
  writeFileSync(join(pages, 'index.tsx'), 'export default function Home() { return null }')

  for (const rootDir of [join(directory, 'site-*'), [join(directory, 'site-*')]]) {
    const eslint = new ESLint({
      overrideConfig: { settings: { next: { rootDir } } },
    })
    const [result] = await eslint.lintText(
      'export default function Page() { return <a href="/">Home</a> }',
      { filePath: 'app/page.tsx' },
    )
    assert.equal(result.fatalErrorCount, 0)
    assert.ok(
      result.messages.some((message) => message.ruleId === '@next/next/no-html-link-for-pages'),
      JSON.stringify(result.messages),
    )
  }
})
