// Keep report generation independent of node_modules so a failed install can still produce a draft PR.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Plan } from './osv-remediation.ts'

const checkNames: Record<string, string> = {
  install: '依存関係のインストール', audit: 'OSV再診断', lint: 'ESLint',
  types: '型検査', tests: 'テスト', external: 'externalのビルド', internal: 'internalのビルド',
}

export function renderReport(plan: Plan, checks: Record<string, { outcome?: string }>, runUrl: string) {
  const ready = plan.manual.length === 0 && Object.keys(checkNames).every((id) => checks[id]?.outcome === 'success')
  const lines = [
    '# OSVによる依存関係の修正', '',
    ready ? '検出された脆弱性を修正し、すべての検証が成功しました。' : '自動修正または検証が完了していません。手動対応が必要なDraft PRです。', '',
    '| パッケージ | 更新前 | 更新後 | 検出された脆弱性 |',
    '| --- | --- | --- | --- |',
    ...plan.updates.map(({ name, from, to, ids }) => `| ${name} | ${from} | ${to} | ${ids.join(', ')} |`),
    ...plan.manual.map(({ name, version, ids }) => `| ${name} | ${version} | 手動対応 | ${ids.join(', ')} |`),
    '', ...plan.manual.map(({ name, reason }) => `- ${name}: ${reason}`), '',
    '| 検証 | 結果 |', '| --- | --- |',
    ...Object.entries(checkNames).map(([id, name]) => `| ${name} | ${checks[id]?.outcome ?? 'skipped'} |`),
    '', `[実行ログ](${runUrl})`, '',
    'このPRの変更に対する検証はPR作成前に上記のActions実行内で行っています。自動マージは行いません。', '',
  ]
  return { ready, body: lines.join('\n') }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2)
  if (!input || !output) throw new Error('Usage: node scripts/osv-remediation-report.ts <plan.json> <report.md>')
  const plan = JSON.parse(readFileSync(input, 'utf8')) as Plan
  const { ready, body } = renderReport(plan, JSON.parse(process.env.CHECK_RESULTS ?? '{}'), process.env.RUN_URL ?? '')
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, body)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, body)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    `draft=${ready ? 'false' : 'always-true'}\nstate=${ready ? 'success' : 'failure'}\n`)
}
