const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export const generateSessionId = (): string =>
  bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))

export const isValidSessionId = (value: string): boolean => SESSION_ID_PATTERN.test(value)

export const hashSessionId = async (sessionId: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sessionId))
  return bytesToBase64Url(new Uint8Array(digest))
}
