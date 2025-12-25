import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

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
