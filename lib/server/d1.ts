export type D1StmtBound = {
  first: <T = unknown>() => Promise<T | null>
  run: () => Promise<unknown>
  all: <T = unknown>() => Promise<{ results: T[] }>
}

export type D1Stmt = {
  bind: (...args: unknown[]) => D1StmtBound
}

export type D1Database = {
  prepare: (q: string) => D1Stmt
}

