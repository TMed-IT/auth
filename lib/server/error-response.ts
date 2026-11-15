import { NextRequest, NextResponse } from 'next/server'
import type { ErrorCode, ErrorKey } from '@/config/site'

export function createErrorRedirect(
  req: NextRequest,
  key: ErrorKey,
  code?: ErrorCode,
) {
  const url = new URL('/error', req.url)
  url.searchParams.set('key', key)
  if (code) url.searchParams.set('code', code)
  return NextResponse.redirect(url, {
    status: 303,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
