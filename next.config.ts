import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";


const devVarsPath = path.join(process.cwd(), ".dev.vars");
if (fs.existsSync(devVarsPath)) {
  const lines = fs.readFileSync(devVarsPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf("=");
    if (sep === -1) continue;
    const key = trimmed.slice(0, sep);
    const value = trimmed.slice(sep + 1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

const requiredPublicEnvVars = [
  "NEXT_PUBLIC_TERMS_URL",
  "NEXT_PUBLIC_PRIVACY_POLICY_URL",
  "NEXT_PUBLIC_SUPPORT_EMAIL",
] as const;

for (const envVar of requiredPublicEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`環境変数 ${envVar} が設定されていません`);
  }
}

const nextConfig: NextConfig = {};

export default nextConfig;

initOpenNextCloudflareForDev();
