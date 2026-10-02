const normalizeRedirectParam = (value: string | null): string | null => {
  if (!value) return null
  try {
    new URL(value)
    return value
  } catch {
    try {
      const decoded = decodeURIComponent(value)
      new URL(decoded)
      return decoded
    } catch {
      return null
    }
  }
}

export const getLoginRedirectCandidate = (search: string, referrer: string): string | null => {
  const queryRedirect = new URLSearchParams(search).get('redirect')
  return normalizeRedirectParam(queryRedirect) ?? normalizeRedirectParam(referrer)
}
