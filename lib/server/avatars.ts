import {
  getAvatarHash,
  getAvatarObjectKey,
  isGoogleAvatarUrl,
} from "@/lib/avatar"

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const AVATAR_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000
const ALLOWED_CONTENT_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
])

const readBoundedBody = async (
  body: ReadableStream<Uint8Array>,
  maximumBytes: number,
): Promise<Uint8Array> => {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maximumBytes) {
        await reader.cancel("avatar_too_large")
        throw new Error("Google avatar exceeds the maximum size")
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export const copyGoogleAvatarToR2 = async (
  bucket: CloudflareEnv["AVATARS"],
  email: string,
  sourceUrl: string | undefined,
): Promise<string | null> => {
  if (!sourceUrl || !isGoogleAvatarUrl(sourceUrl)) return null

  const hash = await getAvatarHash(email)
  const objectKey = getAvatarObjectKey(hash)
  const sourceDigest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(sourceUrl),
  )
  const sourceTag = Array.from(new Uint8Array(sourceDigest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
  const existing = await bucket.head(objectKey)
  const age = existing ? Date.now() - existing.uploaded.getTime() : Infinity
  if (
    existing?.customMetadata?.sourceTag === sourceTag &&
    age >= 0 && age < AVATAR_REFRESH_INTERVAL_MS
  ) return `/avatar/${hash}`

  const source = await fetch(sourceUrl, {
    headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" },
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  })
  if (!source.ok || !source.body || !isGoogleAvatarUrl(source.url)) {
    throw new Error("Google avatar request failed")
  }

  const contentType = source.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase()
  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error("Google avatar returned an unsupported content type")
  }

  const declaredSize = Number(source.headers.get("content-length"))
  if (Number.isFinite(declaredSize) && declaredSize > MAX_AVATAR_BYTES) {
    throw new Error("Google avatar exceeds the maximum size")
  }

  const bytes = await readBoundedBody(source.body, MAX_AVATAR_BYTES)
  await bucket.put(objectKey, bytes, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=3600, stale-while-revalidate=86400",
    },
    customMetadata: { sourceTag },
  })
  return `/avatar/${hash}`
}
