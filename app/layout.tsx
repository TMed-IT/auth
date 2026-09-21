import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "./globals.css";
import { BackgroundDecoration } from "@/components/ui/background";
import siteConfig from "@site-config";

export const metadata: Metadata = {
  title: siteConfig.metadata.title,
  icons: {
    icon: [{ url: siteConfig.brand.faviconPath, type: "image/svg+xml" }],
    shortcut: siteConfig.brand.faviconPath,
  },
};

const themeStyle = {
  "--background": siteConfig.theme.background,
  "--auth-background-secondary": siteConfig.theme.backgroundSecondary,
  "--foreground": siteConfig.theme.foreground,
  "--card": siteConfig.theme.surface,
  "--card-foreground": siteConfig.theme.foreground,
  "--popover": siteConfig.theme.surface,
  "--popover-foreground": siteConfig.theme.foreground,
  "--primary": siteConfig.theme.primary,
  "--auth-primary-strong": siteConfig.theme.primaryStrong,
  "--primary-foreground": siteConfig.theme.primaryForeground,
  "--secondary": siteConfig.theme.surfaceStrong,
  "--secondary-foreground": siteConfig.theme.foreground,
  "--muted": siteConfig.theme.surfaceStrong,
  "--muted-foreground": siteConfig.theme.mutedForeground,
  "--accent": siteConfig.theme.primary,
  "--accent-foreground": siteConfig.theme.primaryForeground,
  "--destructive": siteConfig.theme.danger,
  "--border": siteConfig.theme.border,
  "--input": siteConfig.theme.border,
  "--ring": siteConfig.theme.primary,
  "--auth-success": siteConfig.theme.success,
  "--auth-warning": siteConfig.theme.warning,
  "--auth-danger": siteConfig.theme.danger,
  colorScheme: "dark",
} as CSSProperties;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={siteConfig.metadata.language} className="bg-background" style={themeStyle}>
      <body className="bg-background text-foreground antialiased">
        <BackgroundDecoration />
        {children}
      </body>
    </html>
  );
}
