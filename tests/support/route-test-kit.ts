import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import type { TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import type { NextResponse } from 'next/server'

import type { D1Database } from '../../lib/server/d1.ts'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))

export const createServerLoader = (
  env: Record<string, unknown>,
  site: 'external' | 'internal' = 'external',
  mocks: Record<string, Record<string, unknown>> = {},
) => {
  const cache = new Map<string, { exports: Record<string, unknown> }>()
  const load = (file: string): Record<string, unknown> => {
    const filename = file.endsWith('.ts') ? file : `${file}.ts`
    const existing = cache.get(filename)
    if (existing) return existing.exports
    const loadedModule = { exports: {} }
    cache.set(filename, loadedModule)
    const nodeRequire = createRequire(filename)
    const requireModule = (id: string): unknown => {
      if (mocks[id]) return mocks[id]
      if (id === '@opennextjs/cloudflare') return { getCloudflareContext: () => ({ env }) }
      if (id === '@site-config') return load(resolve(projectRoot, `config/${site}.ts`))
      if (id.startsWith('@/')) return load(resolve(projectRoot, id.slice(2)))
      if (id.startsWith('.')) return load(resolve(dirname(filename), id))
      return nodeRequire(id)
    }
    const { outputText } = transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, esModuleInterop: true },
      fileName: filename,
    })
    new Function('require', 'module', 'exports', outputText)(requireModule, loadedModule, loadedModule.exports)
    return loadedModule.exports
  }
  return (file: string) => load(resolve(projectRoot, file))
}

export const createSqliteD1 = (sql: DatabaseSync): D1Database => ({
  prepare: (query) => ({
    bind: (...values: unknown[]) => {
      const statement = sql.prepare(query)
      const args = values as SQLInputValue[]
      return {
        first: async <T>() => (statement.all(...args)[0] ?? null) as T | null,
        all: async <T>() => ({ results: statement.all(...args) as T[] }),
        run: async () => statement.run(...args),
      }
    },
  }),
})

export const createSchemaDatabase = () => {
  const sql = new DatabaseSync(':memory:')
  sql.exec(readFileSync(resolve(projectRoot, 'schema.sql'), 'utf8'))
  return { sql, db: createSqliteD1(sql) }
}

export const setTestEnv = (t: TestContext, values: Record<string, string>) => {
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key]
    process.env[key] = value
    t.after(() => {
      if (previous === undefined) delete process.env[key]
      else process.env[key] = previous
    })
  }
}

export const cookieHeader = (...responses: NextResponse[]) => {
  const cookies = new Map<string, string>()
  for (const response of responses) {
    for (const cookie of response.cookies.getAll()) {
      if (cookie.value) cookies.set(cookie.name, cookie.value)
      else cookies.delete(cookie.name)
    }
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ')
}
