import { spawn } from "node:child_process"
import { rm } from "node:fs/promises"

import {
  generateWorkerSecrets,
  generateWranglerConfig,
} from "./site-config.mjs"

const site = process.argv[2]
const definition = await generateWranglerConfig(site)
await generateWorkerSecrets(site)

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const run = (args) => new Promise((resolve, reject) => {
  const child = spawn(pnpm, args, { stdio: "inherit", env: process.env })
  child.once("error", reject)
  child.once("exit", (code, signal) => {
    if (code === 0) resolve()
    else reject(new Error(`Command failed (${signal || code}): pnpm ${args.join(" ")}`))
  })
})

const succeeds = (args) => new Promise((resolve, reject) => {
  const child = spawn(pnpm, args, { stdio: "ignore", env: process.env })
  child.once("error", reject)
  child.once("exit", (code, signal) => {
    if (signal) reject(new Error(`Command failed (${signal}): pnpm ${args.join(" ")}`))
    else resolve(code === 0)
  })
})

try {
  const avatarBucketExists = await succeeds([
    "exec", "wrangler", "r2", "bucket", "info", definition.avatarBucketName,
  ])
  if (!avatarBucketExists) {
    await run([
      "exec", "wrangler", "r2", "bucket", "create", definition.avatarBucketName,
    ])
  }
  // Fresh databases are initialized here; subsequent deployments are safe
  // because schema.sql uses idempotent CREATE statements.
  await run([
    "exec", "wrangler", "d1", "execute", "DB", "--remote",
    "--config", definition.configPath, "--file", "schema.sql",
  ])
  await run([
    "exec", "opennextjs-cloudflare", "deploy",
    "--config", definition.configPath,
    "--secrets-file", definition.secretsPath,
  ])
} finally {
  await rm(definition.secretsPath, { force: true })
}
