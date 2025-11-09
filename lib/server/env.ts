import { getCloudflareContext } from '@opennextjs/cloudflare'

export const getServerEnv = <T extends Record<string, unknown>>() => {
  try {
    const { env: cloudflareEnv } = getCloudflareContext()
    const nodeEnv = typeof process !== 'undefined' ? (process.env as unknown as Partial<T>) : {}
    return { ...nodeEnv, ...cloudflareEnv } as T
  } catch {
    const nodeEnv = typeof process !== 'undefined' ? (process.env as unknown as Partial<T>) : {}
    return { ...nodeEnv } as T
  }
}

export const requireEnv = <T>(value: T | undefined, name: string): T => {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Environment variable ${name} is not set`)
  }
  return value
}

