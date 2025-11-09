type DomainEnv = { AUTH_COOKIE_DOMAIN?: string }

const extractRootDomain = (domain?: string) => {
  if (!domain) return null
  const trimmed = domain.trim()
  if (!trimmed) return null
  return trimmed.replace(/^\./, '')
}

export const sameDomainRedirectOrNull = (candidate: string | null, env: DomainEnv) => {
  if (!candidate) return null
  const root = extractRootDomain(env.AUTH_COOKIE_DOMAIN)
  if (!root) return null
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:') return null
    if (url.hostname === root || url.hostname.endsWith(`.${root}`)) return url.toString()
    return null
  } catch {
    return null
  }
}

export const sameDomainRedirectOrFallback = (candidate: string | null, fallback: string, env: DomainEnv) => {
  const root = extractRootDomain(env.AUTH_COOKIE_DOMAIN)
  if (!candidate || !root) return fallback
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:') return fallback
    if (url.hostname === root || url.hostname.endsWith(`.${root}`)) return url.toString()
    return fallback
  } catch {
    return fallback
  }
}

