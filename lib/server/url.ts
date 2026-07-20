type RedirectEnv = {
  AUTH_URL?: string
  AUTH_TRUSTED_ORIGINS?: string
  NEXTJS_ENV?: string
}

const isDevelopment = (env: RedirectEnv) => env.NEXTJS_ENV === 'development'

export const parseTrustedOrigin = (value: string, allowLocalhost = false) => {
  try {
    const url = new URL(value)
    const isLocalHttp =
      allowLocalhost &&
      url.protocol === 'http:' &&
      url.hostname === 'localhost'
    if (url.protocol !== 'https:' && !isLocalHttp) return null
    if (url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

export const getTrustedAuthOrigin = (env: RedirectEnv) =>
  env.AUTH_URL
    ? parseTrustedOrigin(env.AUTH_URL, isDevelopment(env))
    : null

export const getAuthBaseDomain = (env: RedirectEnv) => {
  const authOrigin = getTrustedAuthOrigin(env)
  if (!authOrigin) return null

  const hostname = new URL(authOrigin).hostname
  if (hostname === 'localhost') return null

  const labels = hostname.split('.')
  if (labels.length < 2) return null
  return labels.length >= 3 ? labels.slice(1).join('.') : hostname
}

export const getDefaultRedirectUrl = (env: RedirectEnv) => {
  const authOrigin = getTrustedAuthOrigin(env)
  if (!authOrigin) {
    throw new Error('AUTH_URL must be HTTPS (localhost HTTP is allowed only in development)')
  }

  const authUrl = new URL(authOrigin)
  if (authUrl.hostname === 'localhost') return 'http://localhost/'

  const baseDomain = getAuthBaseDomain(env)
  if (!baseDomain) {
    throw new Error('AUTH_URL must contain a valid domain')
  }
  return `https://${baseDomain}/`
}

const parseTrustedSubdomain = (value: string, env: RedirectEnv) => {
  const subdomain = value.trim().toLowerCase()
  if (!subdomain) return null

  if (
    isDevelopment(env) &&
    /^localhost(?::\d{1,5})?$/.test(subdomain)
  ) {
    try {
      return new URL(`http://${subdomain}`).origin
    } catch {
      return null
    }
  }

  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)
  ) {
    return null
  }

  const baseDomain = getAuthBaseDomain(env)
  return baseDomain ? `https://${subdomain}.${baseDomain}` : null
}

export const getTrustedFrontendOrigins = (env: RedirectEnv): string[] => {
  const defaultOrigin = new URL(getDefaultRedirectUrl(env)).origin
  const additionalOrigins = (env.AUTH_TRUSTED_ORIGINS?.split(',') ?? [])
    .map((value) => parseTrustedSubdomain(value, env))
    .filter((origin): origin is string => origin !== null)

  return [...new Set([
    defaultOrigin,
    ...additionalOrigins,
  ])]
}

export const trustedRedirectOrNull = (candidate: string | null, env: RedirectEnv) => {
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    if (url.username || url.password) return null
    return getTrustedFrontendOrigins(env).includes(url.origin) ? url.toString() : null
  } catch {
    return null
  }
}

export const trustedRedirectOrFallback = (candidate: string | null, env: RedirectEnv) =>
  trustedRedirectOrNull(candidate, env) ?? getDefaultRedirectUrl(env)
