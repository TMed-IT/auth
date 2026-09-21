import { rm } from "node:fs/promises"
import { resolve } from "node:path"

const outputDirectory = resolve(process.cwd(), ".next")
await rm(outputDirectory, { recursive: true, force: true })
