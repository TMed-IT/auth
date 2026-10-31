export type GlobalRateLimitResult = 'allowed' | 'limited' | 'unavailable'

export const checkGlobalRateLimit = async (
  binding: RateLimit | undefined,
  key: string,
): Promise<GlobalRateLimitResult> => {
  if (!binding) return 'unavailable'

  try {
    const result = await binding.limit({ key })
    return result.success ? 'allowed' : 'limited'
  } catch (error) {
    // A transient rate-limit service failure must not disable authentication.
    console.error(JSON.stringify({
      event: 'rate_limit_check_failed',
      key,
      error: error instanceof Error ? error.message : String(error),
    }))
    return 'allowed'
  }
}
