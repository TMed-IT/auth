import { spawn } from "node:child_process"

const site = process.argv[2] || process.env.SITE_CONFIG || "external"
if (site !== "external" && site !== "internal") {
  throw new Error(`Site must be "external" or "internal": ${site}`)
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const child = spawn(pnpm, ["run", `dev:${site}`], {
  stdio: "inherit",
  env: { ...process.env, SITE_CONFIG: site },
})

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
