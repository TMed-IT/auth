type RedirectEnv = {
  AUTH_URL?: string
  AUTH_DEFAULT_REDIRECT_URL?: string
  AUTH_TRUSTED_ORIGINS?: string
  AUTH_ALLOW_ANY_LOCALHOST_REDIRECT?: string
  NEXTJS_ENV?: string
}

const isDevelopment = (env: RedirectEnv) => env.NEXTJS_ENV === 'development'

const isLocalHostname = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1'

export const parseTrustedOrigin = (value: string, allowLocalhost = false) => {
  try {
    const url = new URL(value)
    const isLocalHttp =
      allowLocalhost &&
      url.protocol === 'http:' &&
      isLocalHostname(url.hostname)
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
  if (isLocalHostname(hostname)) return null

  const labels = hostname.split('.')
  if (labels.length < 2) return null
  return labels.length >= 3 ? labels.slice(1).join('.') : hostname
}

export const getDefaultRedirectUrl = (env: RedirectEnv) => {
  const authOrigin = getTrustedAuthOrigin(env)
  if (!authOrigin) {
    throw new Error('AUTH_URL must be HTTPS (localhost HTTP is allowed only in development)')
  }

  const configuredRedirect = env.AUTH_DEFAULT_REDIRECT_URL?.trim()
  if (configuredRedirect) {
    try {
      const url = new URL(configuredRedirect)
      const isLocalHttp =
        isDevelopment(env) &&
        url.protocol === 'http:' &&
        isLocalHostname(url.hostname)
      if ((url.protocol !== 'https:' && !isLocalHttp) || url.username || url.password) {
        throw new Error('invalid default redirect URL')
      }
      return url.toString()
    } catch {
      throw new Error(
        'AUTH_DEFAULT_REDIRECT_URL must be an HTTPS URL (localhost HTTP is allowed only in development)',
      )
    }
  }

  const authUrl = new URL(authOrigin)
  if (isLocalHostname(authUrl.hostname)) return new URL('/', authOrigin).toString()

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
    /^(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(subdomain)
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

/**
 * `pnpm run dev` から起動した場合に限り、任意ポートの localhost を
 * フロントエンドOriginとして扱う。列挙できない開発サーバーのOriginを
 * リダイレクト検証とCORS検証で共通して判定するための関数。
 */
export const trustedFrontendOriginOrNull = (
  candidate: string | null,
  env: RedirectEnv,
) => {
  if (!candidate) return null

  try {
    const url = new URL(candidate)
    if (url.username || url.password) return null

    const isAnyLocalhostAllowed =
      isDevelopment(env) &&
      env.AUTH_ALLOW_ANY_LOCALHOST_REDIRECT === 'true' &&
      url.protocol === 'http:' &&
      isLocalHostname(url.hostname)

    return isAnyLocalhostAllowed || getTrustedFrontendOrigins(env).includes(url.origin)
      ? url.origin
      : null
  } catch {
    return null
  }
}

export const getAllowedAuthOrigins = (
  env: RedirectEnv,
  req?: Request,
): string[] => {
  const authOrigin = getTrustedAuthOrigin(env)
  const requestOrigins = req
    ? [req.headers.get('origin'), req.headers.get('referer')]
      .map((candidate) => trustedFrontendOriginOrNull(candidate, env))
      .filter((origin): origin is string => origin !== null)
    : []

  return [...new Set([
    ...(authOrigin ? [authOrigin] : []),
    ...getTrustedFrontendOrigins(env),
    ...requestOrigins,
  ])]
}

export const trustedRedirectOrNull = (candidate: string | null, env: RedirectEnv) => {
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    if (url.username || url.password) return null
    return trustedFrontendOriginOrNull(url.origin, env) ? url.toString() : null
  } catch {
    return null
  }
}

export const trustedRedirectOrFallback = (candidate: string | null, env: RedirectEnv) =>
  trustedRedirectOrNull(candidate, env) ?? getDefaultRedirectUrl(env)

/**
 * Google/Passkey login may return to exactly `/passkey` on the authentication
 * origin. No other same-origin path is accepted, and an embedded external
 * redirect must independently pass the normal frontend allowlist.
 */
export const trustedPasskeyContinuationOrNull = (
  candidate: string | null,
  env: RedirectEnv,
) => {
  if (!candidate) return null
  const authOrigin = getTrustedAuthOrigin(env)
  if (!authOrigin) return null

  try {
    const url = new URL(candidate)
    if (
      url.origin !== authOrigin ||
      url.pathname !== '/passkey' ||
      url.username ||
      url.password ||
      url.hash ||
      [...url.searchParams.keys()].some((key) => key !== 'redirect') ||
      url.searchParams.getAll('redirect').length > 1
    ) return null

    const nestedRedirect = url.searchParams.get('redirect')
    if (nestedRedirect && !trustedRedirectOrNull(nestedRedirect, env)) return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * 認証サービス内で認証を完了した後、信頼済み EmDash サイトへ認可コードを
 * 返すための継続URLだけを受け付ける。
 */
export const trustedEmDashContinuationOrNull = (
  candidate: string | null,
  env: RedirectEnv,
) => {
  if (!candidate) return null
  const authOrigin = getTrustedAuthOrigin(env)
  if (!authOrigin) return null

  try {
    const url = new URL(candidate)
    if (
      url.origin !== authOrigin ||
      url.pathname !== '/auth/emdash/authorize' ||
      url.username ||
      url.password ||
      url.hash ||
      [...url.searchParams.keys()].some((key) =>
        !['redirect_uri', 'state', 'code_challenge', 'code_challenge_method'].includes(key)
      ) ||
      ['redirect_uri', 'state', 'code_challenge', 'code_challenge_method']
        .some((key) => url.searchParams.getAll(key).length !== 1)
    ) return null

    const redirectUri = url.searchParams.get('redirect_uri')
    const state = url.searchParams.get('state')
    const codeChallenge = url.searchParams.get('code_challenge')
    if (
      !redirectUri ||
      !state ||
      !codeChallenge ||
      url.searchParams.get('code_challenge_method') !== 'S256' ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(state) ||
      !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)
    ) return null

    const callback = new URL(redirectUri)
    if (
      !trustedFrontendOriginOrNull(callback.origin, env) ||
      callback.pathname !== '/_emdash/api/auth/callback' ||
      callback.username ||
      callback.password ||
      callback.search ||
      callback.hash
    ) return null

    return url.toString()
  } catch {
    return null
  }
}

export const trustedAuthFlowRedirectOrNull = (
  candidate: string | null,
  env: RedirectEnv,
) => trustedRedirectOrNull(candidate, env) ??
  trustedPasskeyContinuationOrNull(candidate, env) ??
  trustedEmDashContinuationOrNull(candidate, env)

export const trustedAuthFlowRedirectOrFallback = (
  candidate: string | null,
  env: RedirectEnv,
) => trustedAuthFlowRedirectOrNull(candidate, env) ?? getDefaultRedirectUrl(env)
