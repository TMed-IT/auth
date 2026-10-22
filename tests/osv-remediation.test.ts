import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseDocument } from 'yaml'
import { applyPlan, findingsFromScan, planRemediation, type Plan } from '../scripts/osv-remediation.ts'
import { renderReport } from '../scripts/osv-remediation-report.ts'

function vulnerable(name = 'example', version = '1.0.0', fixes: string[] = ['1.0.1']) {
  return {
    package: { name, version, ecosystem: 'npm' },
    vulnerabilities: [{
      id: 'GHSA-test-0001',
      affected: [{
        package: { name, ecosystem: 'npm' },
        ranges: [{ type: 'SEMVER', events: fixes.map((fixed) => ({ fixed })) }],
      }],
    }],
  }
}
const scan = (...packages: ReturnType<typeof vulnerable>[]) => ({ results: [{ packages }] })
const cleanServices = { available: async () => true, clean: async () => true }
const allChecks = Object.fromEntries(
  ['install', 'audit', 'lint', 'types', 'tests', 'external', 'internal'].map((id) => [id, { outcome: 'success' }]),
)

test('OSVで脆弱性がなければ更新せず、同じパッケージの重複検出はまとめる', async () => {
  assert.deepEqual(await planRemediation(scan(), cleanServices), { updates: [], manual: [] })
  assert.equal(findingsFromScan(scan(vulnerable(), vulnerable())).length, 1)
  assert.equal(findingsFromScan(scan(vulnerable(), vulnerable('example', '1.0.2'))).length, 2)
})

test('複数の修正版から、公開済みかつOSVで脆弱性のない最小バージョンを選ぶ', async () => {
  const queried: string[] = []
  const plan = await planRemediation(scan(vulnerable('@scope/example', '1.0.0', ['1.0.3', '1.0.1', '1.0.2'])), {
    available: async (_name, version) => version !== '1.0.1',
    clean: async (name, version) => {
      assert.equal(name, '@scope/example')
      queried.push(version)
      return version !== '1.0.2'
    },
  })
  assert.equal(plan.updates[0].to, '1.0.3')
  assert.deepEqual(queried, ['1.0.2', '1.0.3'])
})

test('修正版なし・メジャー更新・0.xのマイナー更新・プレリリースは手動対応にする', async () => {
  for (const [version, fixes] of [
    ['1.0.0', []], ['1.0.0', ['2.0.0']], ['0.2.0', ['0.3.0']], ['1.0.0', ['1.0.1-beta.0']],
  ] as [string, string[]][]) {
    const plan = await planRemediation(scan(vulnerable('example', version, fixes)), cleanServices)
    assert.equal(plan.updates.length, 0)
    assert.equal(plan.manual.length, 1)
  }
})

test('別パッケージの修正版は使わず、API障害を修正成功と扱わない', async () => {
  const entry = vulnerable()
  entry.vulnerabilities[0].affected[0].package.name = 'unrelated'
  assert.equal((await planRemediation(scan(entry), cleanServices)).manual.length, 1)
  await assert.rejects(planRemediation(scan(vulnerable()), {
    ...cleanServices, clean: async () => { throw new Error('OSV unavailable') },
  }), /OSV unavailable/)
  assert.throws(() => findingsFromScan({ results: null } as never), /Invalid OSV report/)
})

test('直接依存とNext.jsのESLint設定を更新し、間接依存の上書きは対象バージョンだけに限定する', () => {
  const manifest = {
    dependencies: { next: '16.3.8', example: '^1.0.0', unrelated: '~2.0.0' },
    devDependencies: { 'eslint-config-next': '16.3.8' },
  }
  const workspace = parseDocument('overrides:\n  unrelated: 2.0.0\n')
  applyPlan(manifest, workspace, {
    updates: [
      { name: 'next', from: '16.3.8', to: '16.3.9', ids: [] },
      { name: 'example', from: '1.0.0', to: '1.0.1', ids: [] },
      { name: 'transitive', from: '2.1.0', to: '2.1.1', ids: [] },
    ], manual: [],
  })
  assert.equal(manifest.dependencies.next, '16.3.9')
  assert.equal(manifest.devDependencies['eslint-config-next'], '16.3.9')
  assert.equal(manifest.dependencies.example, '^1.0.1')
  assert.equal(manifest.dependencies.unrelated, '~2.0.0')
  assert.equal(workspace.getIn(['overrides', 'transitive@2.1.0']), '2.1.1')
  assert.equal(workspace.getIn(['overrides', 'transitive']), undefined)
})

test('既存のバージョン固定と親パッケージ限定の上書きを更新し、コメントと別のバージョンを保つ', () => {
  const workspace = parseDocument([
    'overrides:', '  # keep this explanation', '  sharp: 0.35.5',
    '  "parent>source-map-js": 1.2.2', '  "source-map-js@2.0.0": 2.0.1', '',
  ].join('\n'))
  applyPlan({}, workspace, { updates: [
    { name: 'sharp', from: '0.35.5', to: '0.35.6', ids: [] },
    { name: 'source-map-js', from: '1.2.2', to: '1.2.3', ids: [] },
  ], manual: [] })
  assert.equal(workspace.getIn(['overrides', 'sharp']), '0.35.6')
  assert.equal(workspace.getIn(['overrides', 'parent>source-map-js']), '1.2.3')
  assert.equal(workspace.getIn(['overrides', 'source-map-js@2.0.0']), '2.0.1')
  assert.match(workspace.toString(), /# keep this explanation/)
})

test('Next.jsとのバージョン合わせで、すでに新しいESLint設定をダウングレードしない', () => {
  const manifest = { dependencies: { next: '16.3.8' }, devDependencies: { 'eslint-config-next': '16.4.2' } }
  applyPlan(manifest, parseDocument('overrides: {}'), {
    updates: [{ name: 'next', from: '16.3.8', to: '16.3.9', ids: [] }], manual: [],
  })
  assert.equal(manifest.devDependencies['eslint-config-next'], '16.4.2')
})

test('全チェック成功時だけReadyにし、失敗・未実行・未修正のいずれでもDraftにする', () => {
  const plan: Plan = { updates: [{ name: 'example', from: '1.0.0', to: '1.0.1', ids: ['GHSA-test-0001'] }], manual: [] }
  assert.equal(renderReport(plan, allChecks, 'https://example.com/run').ready, true)
  assert.equal(renderReport(plan, {}, '').ready, false)
  for (const id of Object.keys(allChecks)) {
    assert.equal(renderReport(plan, { ...allChecks, [id]: { outcome: 'failure' } }, '').ready, false)
    assert.equal(renderReport(plan, { ...allChecks, [id]: { outcome: 'skipped' } }, '').ready, false)
  }
  plan.manual.push({ name: 'braces', version: '3.0.3', ids: ['GHSA-test-0002'], reason: '修正版なし' })
  const report = renderReport(plan, allChecks, 'https://example.com/run')
  assert.equal(report.ready, false)
  assert.match(report.body, /手動対応/)
  assert.match(report.body, /GHSA-test-0002/)
})

test('修正版がない場合もCLIでDraft PR用の報告書とActions出力を生成する', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'auth-osv-remediation-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const script = fileURLToPath(new URL('../scripts/osv-remediation.ts', import.meta.url))
  writeFileSync(join(directory, 'before.json'), JSON.stringify(scan(vulnerable('braces', '3.0.3', []))))
  writeFileSync(join(directory, 'package.json'), '{}\n')
  writeFileSync(join(directory, 'pnpm-workspace.yaml'), 'overrides: {}\n')
  const planned = spawnSync(process.execPath, [script, 'before.json', 'plan.json'], { cwd: directory, encoding: 'utf8' })
  assert.equal(planned.status, 0, planned.stderr)
  // Copy only the report script: it must also work when node_modules is missing.
  const reportScript = fileURLToPath(new URL('../scripts/osv-remediation-report.ts', import.meta.url))
  writeFileSync(join(directory, 'report.ts'), readFileSync(reportScript))
  const reported = spawnSync(process.execPath, ['report.ts', 'plan.json', 'docs/report.md'], {
    cwd: directory, encoding: 'utf8',
    env: { ...process.env, CHECK_RESULTS: JSON.stringify(allChecks), GITHUB_OUTPUT: join(directory, 'outputs'), GITHUB_STEP_SUMMARY: join(directory, 'summary') },
  })
  assert.equal(reported.status, 0, reported.stderr)
  assert.match(readFileSync(join(directory, 'outputs'), 'utf8'), /draft=always-true\nstate=failure/)
  assert.match(readFileSync(join(directory, 'docs/report.md'), 'utf8'), /braces/)
})
