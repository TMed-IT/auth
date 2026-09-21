import { getCloudflareContext } from '@opennextjs/cloudflare'

export const getServerEnv = <T extends Record<string, unknown>>() => {
  if (typeof process === 'undefined' || !process.env) {
    throw new Error('process.env is not available')
  }
  const { env } = getCloudflareContext()
  const cloudflareEnv: Record<string, unknown> = { ...env }
  const nodeEnv: Record<string, unknown> = process.env
  return { ...cloudflareEnv, ...nodeEnv } as T
}

export const requireEnv = <T>(value: T | undefined, name: string): T => {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Environment variable ${name} is not set`)
  }
  return value
}

export const requireSecret = (
  value: string | undefined,
  name: string,
  minimumBytes = 32,
): string => {
  const secret = requireEnv(value, name)
  if (new TextEncoder().encode(secret).byteLength < minimumBytes) {
    throw new Error(`Environment variable ${name} must be at least ${minimumBytes} bytes`)
  }
  return secret
}
