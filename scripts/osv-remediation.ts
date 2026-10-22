import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import semver from 'semver'
import { parseDocument, type Document } from 'yaml'

type Advisory = {
  id: string
  affected?: {
    package?: { name: string; ecosystem: string }
    ranges?: { type: string; events: { fixed?: string }[] }[]
  }[]
}
type Finding = { name: string; version: string; vulnerabilities: Advisory[] }
type Scan = {
  results: {
    packages?: {
      package: { name: string; version: string; ecosystem: string }
      vulnerabilities?: Advisory[]
    }[]
  }[]
}
type Update = { name: string; from: string; to: string; ids: string[] }
type Manual = { name: string; version: string; ids: string[]; reason: string }
export type Plan = { updates: Update[]; manual: Manual[] }
type Manifest = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

export function findingsFromScan(scan: Scan): Finding[] {
  if (!Array.isArray(scan.results)) throw new Error('Invalid OSV report: results must be an array')
  const findings = new Map<string, Finding>()
  for (const result of scan.results) {
    for (const entry of result.packages ?? []) {
      if (!entry.vulnerabilities?.length) continue
      const { name, version, ecosystem } = entry.package
      if (ecosystem !== 'npm' || !semver.valid(version) ||
          !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) {
        throw new Error(`Unsupported vulnerable package: ${ecosystem}/${name}@${version}`)
      }
      const key = `${name}@${version}`
      const finding = findings.get(key) ?? { name, version, vulnerabilities: [] }
      for (const advisory of entry.vulnerabilities) {
        if (!/^[a-z0-9-]+$/i.test(advisory.id)) throw new Error('Invalid advisory ID')
        if (!finding.vulnerabilities.some((item) => item.id === advisory.id)) {
          finding.vulnerabilities.push(advisory)
        }
      }
      findings.set(key, finding)
    }
  }
  return [...findings.values()].sort((a, b) => a.name.localeCompare(b.name) || semver.compare(a.version, b.version))
}

export async function planRemediation(scan: Scan, services: {
  available: (name: string, version: string) => Promise<boolean>
  clean: (name: string, version: string) => Promise<boolean>
}): Promise<Plan> {
  const plan: Plan = { updates: [], manual: [] }
  for (const finding of findingsFromScan(scan)) {
    const candidates = new Set<string>()
    for (const advisory of finding.vulnerabilities) {
      for (const affected of advisory.affected ?? []) {
        if (affected.package?.name !== finding.name || affected.package.ecosystem !== 'npm') continue
        for (const range of affected.ranges ?? []) {
          if (range.type !== 'SEMVER') continue
          for (const { fixed } of range.events) {
            if (fixed && semver.valid(fixed) && !semver.prerelease(fixed) &&
                semver.gt(fixed, finding.version) &&
                semver.major(fixed) === semver.major(finding.version) &&
                (semver.major(fixed) !== 0 || semver.minor(fixed) === semver.minor(finding.version))) {
              candidates.add(fixed)
            }
          }
        }
      }
    }
    let to: string | undefined
    for (const candidate of [...candidates].sort(semver.compare)) {
      if (await services.available(finding.name, candidate) && await services.clean(finding.name, candidate)) {
        to = candidate
        break
      }
    }
    const ids = finding.vulnerabilities.map(({ id }) => id).sort()
    if (to) plan.updates.push({ name: finding.name, from: finding.version, to, ids })
    else plan.manual.push({
      name: finding.name, version: finding.version, ids,
      reason: '同じメジャー版内で、公開済みかつOSVで脆弱性のない修正版を確認できませんでした（0.xは同じマイナー版内）。手動対応が必要です。',
    })
  }
  return plan
}

function upgradedSpecifier(specifier: string, version: string): string {
  return `${specifier.startsWith('^') ? '^' : specifier.startsWith('~') ? '~' : ''}${version}`
}

export function applyPlan(manifest: Manifest, workspace: Document, plan: Plan) {
  for (const update of plan.updates) {
    for (const section of [manifest.dependencies, manifest.devDependencies, manifest.optionalDependencies]) {
      const specifier = section?.[update.name]
      if (section && specifier && semver.validRange(specifier) && semver.satisfies(update.from, specifier)) {
        section[update.name] = upgradedSpecifier(specifier, update.to)
      }
    }
    let replacedOverride = false
    const overrides: Record<string, string> = workspace.toJS().overrides ?? {}
    for (const [selector, value] of Object.entries(overrides)) {
      const target = selector.split('>').at(-1)!
      const targetsPackage = target === update.name ||
        (target.startsWith(`${update.name}@`) && semver.satisfies(update.from, target.slice(update.name.length + 1)))
      if (targetsPackage && semver.validRange(value) && semver.satisfies(update.from, value)) {
        workspace.setIn(['overrides', selector], upgradedSpecifier(value, update.to))
        replacedOverride = true
      }
    }
    // Scope new overrides to exactly the affected version, including transitive dependencies.
    if (!replacedOverride) workspace.setIn(['overrides', `${update.name}@${update.from}`], update.to)
  }
  // Next.js publishes its ESLint configuration alongside each framework release.
  const nextUpdate = plan.updates.find(({ name }) => name === 'next')
  const eslintSpecifier = manifest.devDependencies?.['eslint-config-next']
  const eslintMinimum = eslintSpecifier && semver.validRange(eslintSpecifier) ? semver.minVersion(eslintSpecifier) : null
  if (nextUpdate && eslintSpecifier && eslintMinimum && semver.lt(eslintMinimum, nextUpdate.to)) {
    manifest.devDependencies!['eslint-config-next'] = upgradedSpecifier(
      eslintSpecifier, nextUpdate.to,
    )
  }
}

async function fetchJson(url: string, init?: RequestInit, allowMissing = false) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
  if (allowMissing && response.status === 404) return null
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.json()
}

async function main() {
  const [input, output] = process.argv.slice(2)
  if (!input || !output) {
    throw new Error('Usage: node scripts/osv-remediation.ts <scan.json> <plan.json>')
  }
  const plan = await planRemediation(JSON.parse(readFileSync(input, 'utf8')), {
    available: async (name, version) => Boolean(await fetchJson(
      `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`, undefined, true,
    )),
    clean: async (name, version) => {
      const response = await fetchJson('https://api.osv.dev/v1/querybatch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: [{ package: { name, ecosystem: 'npm' }, version }] }),
      }) as { results?: { vulns?: unknown[] }[] } | null
      if (!response || !Array.isArray(response.results) || response.results.length !== 1 || !response.results[0]) {
        throw new Error('Invalid OSV query response')
      }
      if (response.results[0].vulns !== undefined && !Array.isArray(response.results[0].vulns)) {
        throw new Error('Invalid OSV vulnerability list')
      }
      return (response.results[0].vulns ?? []).length === 0
    },
  })
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
  const workspace = parseDocument(readFileSync('pnpm-workspace.yaml', 'utf8'))
  if (workspace.errors.length) throw new Error('Invalid pnpm-workspace.yaml')
  applyPlan(manifest, workspace, plan)
  writeFileSync('package.json', `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync('pnpm-workspace.yaml', workspace.toString())
  writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}
