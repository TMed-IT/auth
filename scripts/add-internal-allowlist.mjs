import { spawn } from "node:child_process"

import { generateWranglerConfig } from "./site-config.mjs"

const usage = [
  "Usage:",
  "  pnpm run whitelist:add:internal -- user@example.com [more@example.com]",
  "  pnpm run whitelist:add:internal -- user@example.com --remote",
].join("\n")

const args = process.argv.slice(2).filter((arg) => arg !== "--")
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage)
  process.exit(0)
}

const supportedFlags = new Set(["--remote"])
const unknownFlags = args.filter((arg) => arg.startsWith("-") && !supportedFlags.has(arg))
if (unknownFlags.length > 0) {
  throw new Error(`Unknown option: ${unknownFlags.join(", ")}\n\n${usage}`)
}

const remote = args.includes("--remote")
const emails = [...new Set(
  args
    .filter((arg) => !arg.startsWith("-"))
    .map((email) => email.trim().toLowerCase()),
)]

if (emails.length === 0) {
  throw new Error(`Specify at least one email address.\n\n${usage}`)
}

const isValidEmail = (email) =>
  email.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)

const invalidEmails = emails.filter((email) => !isValidEmail(email))
if (invalidEmails.length > 0) {
  throw new Error(`Invalid email address: ${invalidEmails.join(", ")}`)
}

const sqlString = (value) => `'${value.replaceAll("'", "''")}'`
const sql = emails
  .map((email) =>
    `INSERT INTO users(email, created_at) VALUES (${sqlString(email)}, datetime('now')) ON CONFLICT(email) DO NOTHING;`,
  )
  .join("\n")

const definition = await generateWranglerConfig("internal")
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const wranglerArgs = [
  "exec",
  "wrangler",
  "d1",
  "execute",
  "DB",
  remote ? "--remote" : "--local",
  ...(!remote ? ["--persist-to", ".wrangler/state/internal"] : []),
  "--config",
  definition.configPath,
  "--command",
  sql,
]

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(pnpm, wranglerArgs, {
    stdio: "inherit",
    env: process.env,
  })
  child.once("error", reject)
  child.once("exit", (code, signal) => {
    if (signal) reject(new Error(`Wrangler was terminated by ${signal}`))
    else resolve(code ?? 1)
  })
})

if (exitCode !== 0) {
  throw new Error(`Wrangler exited with code ${exitCode}`)
}

console.log(
  `${remote ? "Remote" : "Local"} internal allowlist updated: ${emails.join(", ")}`,
)
