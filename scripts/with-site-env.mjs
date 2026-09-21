import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const sites = new Set(["external", "internal"])
const [site, separator, ...command] = process.argv.slice(2)

if (!sites.has(site) || separator !== "--" || command.length === 0) {
  throw new Error(
    "Usage: node scripts/with-site-env.mjs <external|internal> -- <command> [...args]",
  )
}

const localFile = `.env.${site}.local`
const sharedFile = `.env.${site}`
const privateKeyName = `DOTENV_PRIVATE_KEY_${site.toUpperCase()}`

const hasPrivateKeyInFile = async () => {
  if (!existsSync(".env.keys")) return false
  const keys = await readFile(".env.keys", "utf8")
  return new RegExp(`^(?:DOTENV_PRIVATE_KEY|${privateKeyName})=.+$`, "m").test(keys)
}

const sharedFileIsEncrypted = async () => {
  if (!existsSync(sharedFile)) return false
  const contents = await readFile(sharedFile, "utf8")
  return /=\s*["']?encrypted:/m.test(contents)
}

const hasPrivateKey = Boolean(
  process.env.DOTENV_PRIVATE_KEY ||
  process.env[privateKeyName] ||
  await hasPrivateKeyInFile()
)
const isSharedEncrypted = await sharedFileIsEncrypted()

if (!existsSync(localFile) && isSharedEncrypted && !hasPrivateKey) {
  throw new Error(
    `${sharedFile} is encrypted. Set ${privateKeyName} or create ${localFile}.`,
  )
}

const envFiles = [
  ...(existsSync(localFile) ? ["-f", localFile] : []),
  ...(existsSync(sharedFile) ? ["-f", sharedFile] : []),
]
const ignoredErrors = [
  "--ignore=MISSING_ENV_FILE",
  ...(!hasPrivateKey && isSharedEncrypted ? ["--ignore=DECRYPTION_FAILED"] : []),
]
const dotenvx = resolve(
  "node_modules/.bin",
  process.platform === "win32" ? "dotenvx.cmd" : "dotenvx",
)
const child = spawn(
  dotenvx,
  ["run", ...ignoredErrors, ...envFiles, "--", ...command],
  { stdio: "inherit", env: process.env },
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
