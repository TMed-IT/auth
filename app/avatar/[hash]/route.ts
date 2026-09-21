import { NextRequest, NextResponse } from "next/server"

import { getAvatarObjectKey } from "@/lib/avatar"
import { getServerEnv } from "@/lib/server/env"

type AvatarEnv = {
  AVATARS?: CloudflareEnv["AVATARS"]
}

type RouteContext = { params: Promise<{ hash: string }> }

const notFound = () => new NextResponse(null, {
  status: 404,
  headers: { "Cache-Control": "private, no-store" },
})

export async function GET(req: NextRequest, context: RouteContext) {
  const { hash } = await context.params
  if (!/^[a-f0-9]{64}$/.test(hash)) return notFound()

  const bucket = getServerEnv<AvatarEnv>().AVATARS
  if (!bucket) return notFound()

  const object = await bucket.get(getAvatarObjectKey(hash))
  if (!object) return notFound()

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")
  headers.set("ETag", object.httpEtag)
  headers.set("X-Content-Type-Options", "nosniff")

  if (req.headers.get("if-none-match") === object.httpEtag) {
    return new NextResponse(null, { status: 304, headers })
  }

  return new NextResponse(object.body, { headers })
}
