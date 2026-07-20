import { NextResponse } from 'next/server'

const appendVary = (headers: Headers, value: string) => {
  const current = headers.get('vary')
  const values = new Set(
    (current ? current.split(',') : [])
      .map((item) => item.trim())
      .filter(Boolean),
  )
  values.add(value)
  headers.set('Vary', [...values].join(', '))
}

export const applyCredentialedCors = (
  response: NextResponse,
  req: Request,
  allowedOrigins: string[],
) => {
  const origin = req.headers.get('origin')
  if (!origin || !allowedOrigins.includes(origin)) return response

  response.headers.set('Access-Control-Allow-Origin', origin)
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  appendVary(response.headers, 'Origin')
  return response
}

export const createCorsPreflightResponse = (
  req: Request,
  allowedOrigins: string[],
) => {
  const origin = req.headers.get('origin')
  if (!origin || !allowedOrigins.includes(origin)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 })
  }

  const response = new NextResponse(null, {
    status: 204,
    headers: { 'Cache-Control': 'private, no-store' },
  })
  response.headers.set('Access-Control-Allow-Origin', origin)
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  response.headers.set('Access-Control-Max-Age', '600')
  appendVary(response.headers, 'Origin')
  return response
}
