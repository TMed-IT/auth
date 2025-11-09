import { getAuthCookie } from '@/app/api/_auth/token'
import { verifyJWT } from '@/app/api/_auth/auth'
import { getServerEnv } from '@/lib/server/env'
import type { D1Database } from '@/lib/server/d1'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

type SessionEnv = { DB?: D1Database }

export async function GET(req: NextRequest) {
  const env = getServerEnv<SessionEnv>()
  const token = getAuthCookie(req)
  if (!token) return NextResponse.json({ user: null })
  const payload = await verifyJWT(token)
  if (!payload) return NextResponse.json({ user: null })
  const db = env.DB as D1Database
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(payload.sub).first<{ id: string; email: string; given_name: string; family_name: string; display_name: string | null; created_at: string }>()
  if (!row) return NextResponse.json({ user: null })
  return NextResponse.json({ user: { id: row.id, email: row.email, given_name: row.given_name, family_name: row.family_name, display_name: row.display_name, created_at: row.created_at } })
}
