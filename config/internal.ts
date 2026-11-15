import { defineSiteConfig } from "./site.ts"

const internalBrandImage = new URL("../brand/internal.svg", import.meta.url).pathname

const config = defineSiteConfig({
  auth: {
    allowSelfRegistration: false,
  },
  brand: {
    organizationName: "IT部",
    logoPath: internalBrandImage,
    faviconPath: internalBrandImage,
  },
  theme: {
    background: "#090b1c",
    backgroundSecondary: "#171a3c",
    surface: "#121630",
    surfaceStrong: "#1b2043",
    foreground: "#f7f7fb",
    mutedForeground: "#a7abc3",
    border: "#30365e",
    primary: "#a5b4fc",
    primaryStrong: "#6366f1",
    primaryForeground: "#ffffff",
    success: "#86efac",
    warning: "#fcd34d",
    danger: "#fca5a5",
  },
  publicLinks: [
    { label: "規定", url: "https://tmedit.org/docs/regulations" },
    { label: "利用規約", url: "https://tohom.org/internal-terms" },
    { label: "機密情報及び成果物取扱規程", url: "https://tmedit.org/docs/governance" },
    { label: "プライバシーポリシー", url: "https://tohom.org/privacy" },
  ],
  login: {
    audienceIcon: "shield-check",
    audienceHeading: "部員のみなさまへ",
    accountGuidance: "指定されたGoogleアカウントでログインしてください。未承認のアカウントは利用できません。",
  },
  error: {
    emailNotAllowlisted: "このメールアドレスは許可されていません",
  },
})

export default config
