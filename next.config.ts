import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import path from "node:path";

const siteTarget = process.env.SITE_CONFIG ?? "external";
if (siteTarget !== "external" && siteTarget !== "internal") {
  throw new Error(`SITE_CONFIG must be "external" or "internal": ${siteTarget}`);
}
const siteConfigPath = path.resolve(process.cwd(), `config/${siteTarget}.ts`);
const siteConfigModule = `./config/${siteTarget}.ts`;

const isProduction = process.env.NODE_ENV === "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${isProduction ? "" : " ws: http: https:"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "Referrer-Policy",
    value: "no-referrer",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "off",
  },
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  agentRules: false,
  distDir: isProduction ? ".next" : `.next/${siteTarget}`,
  images: {
    unoptimized: true,
  },
  turbopack: {
    resolveAlias: {
      "@site-config": siteConfigModule,
    },
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@site-config$": siteConfigPath,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

if (process.env.NODE_ENV !== "production") {
  const wranglerConfigPath = process.env.WRANGLER_CONFIG_PATH;
  if (!wranglerConfigPath) {
    throw new Error("WRANGLER_CONFIG_PATH is required during local development");
  }
  initOpenNextCloudflareForDev({
    configPath: path.resolve(process.cwd(), wranglerConfigPath),
    persist: {
      // Wrangler's --persist-to appends /v3; getPlatformProxy uses this path as-is.
      path: path.resolve(process.cwd(), `.wrangler/state/${siteTarget}/v3`),
    },
  });
}
