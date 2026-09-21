import { randomBytes } from "node:crypto"
import { spawn } from "node:child_process"
import { resolve } from "node:path"

const site = process.env.SITE_CONFIG
if (site !== "external" && site !== "internal") {
  throw new Error('SITE_CONFIG must be "external" or "internal"')
}

const defaultAuthUrls = {
  external: "http://localhost:3000",
  internal: "http://localhost:3001",
}

const getLocalAuthUrl = (value) => {
  if (!value) return null

  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }

  const isLocalHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")

  if (
    !isLocalHttp ||
    !url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    return null
  }

  return url
}

const authUrl = getLocalAuthUrl(process.env.AUTH_URL) ?? new URL(defaultAuthUrls[site])

process.env.AUTH_URL = authUrl.origin
process.env.NEXTJS_ENV = "development"

const { generateWranglerConfig } = await import("./site-config.mjs")
await generateWranglerConfig(site)

const env = { ...process.env }
for (const name of ["ENCRYPTION_SECRET", "CSRF_SECRET"]) {
  if (!env[name]) env[name] = randomBytes(48).toString("base64url")
}

const next = resolve(
  "node_modules/.bin",
  process.platform === "win32" ? "next.cmd" : "next",
)
const child = spawn(
  next,
  [
    "dev",
    "--turbopack",
    "--hostname",
    authUrl.hostname,
    "--port",
    authUrl.port,
  ],
  { stdio: "inherit", env },
)

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal))
}

child.once("error", (error) => {
  throw error
})
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exitCode = code ?? 1
})
