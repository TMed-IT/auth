const AVATAR_PATH_PATTERN = /^\/avatar\/([a-f0-9]{64})$/

export const normalizeAvatarPath = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  return AVATAR_PATH_PATTERN.test(value) ? value : null
}

export const getAvatarHash = async (email: string): Promise<string> => {
  const normalizedEmail = email.trim().toLowerCase()
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalizedEmail),
  )
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("")
}

export const getAvatarObjectKey = (hash: string) => `avatars/${hash}`

export const isGoogleAvatarUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.hostname === "googleusercontent.com" ||
        url.hostname.endsWith(".googleusercontent.com"))
    )
  } catch {
    return false
  }
}
