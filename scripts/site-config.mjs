import { chmod, writeFile } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const siteDefinitions = {
  external: {
    workerName: "auth-external",
    configPath: ".wrangler.external.jsonc",
    secretsPath: ".wrangler.external.secrets.json",
  },
  internal: {
    workerName: "auth-internal",
    configPath: ".wrangler.internal.jsonc",
    secretsPath: ".wrangler.internal.secrets.json",
  },
}

const requiredPublicVariables = [
  "AUTH_URL",
  "SESSION_MAX_AGE",
  "GOOGLE_CLIENT_ID",
  "D1_DATABASE_NAME",
  "D1_DATABASE_ID",
  "R2_AVATAR_BUCKET_NAME",
]

const persistentSecretVariables = ["GOOGLE_CLIENT_SECRET"]

const generatedSecretVariables = [
  "ENCRYPTION_SECRET",
  "CSRF_SECRET",
]

const requiredSecretVariables = [
  ...persistentSecretVariables,
  ...generatedSecretVariables,
]

const isMissing = (value) =>
  typeof value !== "string" || !value || value.startsWith("REPLACE_WITH_")

const requireVariables = (names, site) => {
  const missing = names.filter((name) => isMissing(process.env[name]))
  if (missing.length) {
    throw new Error(`Missing deployment variables for ${site}: ${missing.join(", ")}`)
  }
}

const getAuthTarget = () => {
  const authUrl = new URL(process.env.AUTH_URL)
  const isLocalHttp =
    authUrl.protocol === "http:" &&
    (authUrl.hostname === "localhost" || authUrl.hostname === "127.0.0.1")
  if (authUrl.protocol !== "https:" && !isLocalHttp) {
    throw new Error("AUTH_URL must be HTTPS (HTTP is allowed only for localhost)")
  }
  if (authUrl.pathname !== "/" || authUrl.search || authUrl.hash) {
    throw new Error("AUTH_URL must contain only an origin")
  }

  const labels = authUrl.hostname.split(".")
  const zoneName = labels.length >= 3 ? labels.slice(1).join(".") : authUrl.hostname
  return { authUrl, isLocalHttp, zoneName }
}

const getDefaultRedirectUrl = (allowLocalHttp) => {
  const value = process.env.AUTH_DEFAULT_REDIRECT_URL
  if (isMissing(value)) return null

  let redirectUrl
  try {
    redirectUrl = new URL(value)
  } catch {
    throw new Error("AUTH_DEFAULT_REDIRECT_URL must be an absolute URL")
  }
  const isLocalRedirect =
    allowLocalHttp &&
    redirectUrl.protocol === "http:" &&
    (redirectUrl.hostname === "localhost" || redirectUrl.hostname === "127.0.0.1")
  if ((redirectUrl.protocol !== "https:" && !isLocalRedirect) || redirectUrl.username || redirectUrl.password) {
    throw new Error(
      "AUTH_DEFAULT_REDIRECT_URL must be HTTPS (localhost HTTP is allowed only in development)",
    )
  }
  return redirectUrl.toString()
}

export const getSiteDefinition = (site) => {
  const definition = siteDefinitions[site]
  if (!definition) throw new Error(`Unknown site: ${site}`)
  return {
    ...definition,
    configPath: resolve(definition.configPath),
    secretsPath: resolve(definition.secretsPath),
  }
}

export const generateWranglerConfig = async (site) => {
  const siteRequiredPublicVariables = site === "external"
    ? [...requiredPublicVariables, "AUTH_EMAIL_ALLOW_REGEX"]
    : requiredPublicVariables
  requireVariables(siteRequiredPublicVariables, site)
  const definition = getSiteDefinition(site)
  const avatarBucketName = process.env.R2_AVATAR_BUCKET_NAME
  const expectedAvatarBucketName = process.env.D1_DATABASE_NAME
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(avatarBucketName)) {
    throw new Error(
      "R2_AVATAR_BUCKET_NAME must contain 3-63 lowercase letters, numbers, or hyphens",
    )
  }
  if (avatarBucketName !== expectedAvatarBucketName) {
    throw new Error(
      `R2_AVATAR_BUCKET_NAME must match D1_DATABASE_NAME (${expectedAvatarBucketName})`,
    )
  }
  const { authUrl, isLocalHttp, zoneName } = getAuthTarget()
  const defaultRedirectUrl = getDefaultRedirectUrl(
    isLocalHttp || process.env.NEXTJS_ENV === "development",
  )
  const maxAge = Number(process.env.SESSION_MAX_AGE)
  if (!Number.isFinite(maxAge) || maxAge <= 0) {
    throw new Error("SESSION_MAX_AGE must be a positive finite number")
  }

  const config = {
    name: definition.workerName,
    main: ".open-next/worker.js",
    compatibility_date: "2026-07-20",
    compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
    assets: {
      binding: "ASSETS",
      directory: ".open-next/assets",
    },
    observability: { enabled: true },
    secrets: { required: requiredSecretVariables },
    vars: {
      AUTH_URL: authUrl.origin,
      ...(defaultRedirectUrl
        ? { AUTH_DEFAULT_REDIRECT_URL: defaultRedirectUrl }
        : {}),
      SESSION_MAX_AGE: maxAge,
      ...(site === "external"
        ? { AUTH_EMAIL_ALLOW_REGEX: process.env.AUTH_EMAIL_ALLOW_REGEX }
        : {}),
      NEXTJS_ENV: process.env.NEXTJS_ENV || (isLocalHttp ? "development" : "production"),
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      ...(process.env.AUTH_TRUSTED_ORIGINS
        ? { AUTH_TRUSTED_ORIGINS: process.env.AUTH_TRUSTED_ORIGINS }
        : {}),
      ...(process.env.TEMP_COOKIE_MAX_AGE
        ? { TEMP_COOKIE_MAX_AGE: Number(process.env.TEMP_COOKIE_MAX_AGE) }
        : {}),
    },
    d1_databases: [{
      binding: "DB",
      database_name: process.env.D1_DATABASE_NAME,
      database_id: process.env.D1_DATABASE_ID,
    }],
    r2_buckets: [{
      binding: "AVATARS",
      bucket_name: avatarBucketName,
    }],
    workers_dev: isLocalHttp,
    ...(!isLocalHttp
      ? { routes: [{ pattern: `${authUrl.hostname}/*`, zone_name: zoneName }] }
      : {}),
  }

  await writeFile(definition.configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  return {
    ...definition,
    avatarBucketName,
  }
}

export const generateWorkerSecrets = async (site) => {
  requireVariables(persistentSecretVariables, site)
  const definition = getSiteDefinition(site)
  const generatedSecrets = Object.fromEntries(
    generatedSecretVariables.map((name) => [name, randomBytes(48).toString("base64url")]),
  )
  if (process.env.GITHUB_ACTIONS === "true") {
    for (const value of Object.values(generatedSecrets)) {
      process.stdout.write(`::add-mask::${value}\n`)
    }
  }
  const secrets = {
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    ...generatedSecrets,
  }
  await writeFile(definition.secretsPath, `${JSON.stringify(secrets)}\n`, { mode: 0o600 })
  await chmod(definition.secretsPath, 0o600)
  return definition
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isCli) {
  const site = process.argv[2]
  const definition = await generateWranglerConfig(site)
  if (process.argv.includes("--with-secrets")) await generateWorkerSecrets(site)
  console.log(definition.configPath)
}
