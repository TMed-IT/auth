import { defineSiteConfig } from "./site.ts"

const externalBrandImage = new URL("../brand/external.svg", import.meta.url).pathname

const config = defineSiteConfig({
  auth: {
    allowSelfRegistration: true,
  },
  brand: {
    organizationName: "東邦大学医学部学生自治会",
    logoPath: externalBrandImage,
    faviconPath: externalBrandImage,
  },
  theme: {
    background: "#061426",
    backgroundSecondary: "#0b2b4f",
    surface: "#0d223a",
    surfaceStrong: "#143453",
    foreground: "#eff8ff",
    mutedForeground: "#9db8cf",
    border: "#285273",
    primary: "#38bdf8",
    primaryStrong: "#2563eb",
    primaryForeground: "#ffffff",
    success: "#86efac",
    warning: "#fcd34d",
    danger: "#fca5a5",
  },
  publicInfo: {
    termsUrl: "https://tmedit.org/terms",
    privacyPolicyUrl: "https://tmedit.org/privacy",
  },
  login: {
    audienceIcon: "graduation-cap",
    audienceHeading: "ご利用いただく方へ",
    accountGuidance: "大学から付与されたGoogleアカウントでログインしてください。",
  },
  error: {
    emailNotAllowlisted: "このアカウントは利用登録されていません",
  },
})

export default config
