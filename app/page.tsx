"use client"

import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser"
import { motion } from "framer-motion"
import Link from "next/link"
import { useEffect, useState } from "react"
 
import { GraduationCap, KeyRound, ShieldCheck } from "lucide-react"
import { AuthCard } from "@/components/ui/auth-card"
import { Logo } from "@/components/ui/logo"
import { Skeleton } from "@/components/ui/skeleton"
import { SupportLink } from "@/components/ui/support-link"
import siteConfig from "@site-config"

type SigninResp = { authUrl?: string }
type PasskeyVerifyResp = { success?: boolean; redirect?: string; error?: string }
type MeResponse = { authenticated?: boolean; consented?: boolean }

const normalizeRedirectParam = (value: string | null): string | null => {
  if (!value) return null
  try {
    // If already a valid URL, use as-is.
    new URL(value)
    return value
  } catch {
    try {
      const decoded = decodeURIComponent(value)
      new URL(decoded)
      return decoded
    } catch {
      return null
    }
  }
}

function LoginPageSkeleton() {
  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center p-4"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">ログイン状態を確認しています</span>
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 space-y-3">
          <div className="flex items-center justify-center gap-3">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="h-5 w-40" />
          </div>
          <Skeleton className="mx-auto h-9 w-28" />
        </div>

        <AuthCard className="space-y-4">
          <div className="space-y-3 rounded-lg border border-border p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <Skeleton className="h-13 w-full rounded-xl" />
          <Skeleton className="h-13 w-full rounded-xl" />
          <Skeleton className="mx-auto h-3 w-3/4" />
        </AuthCard>
        <Skeleton className="mx-auto mt-6 h-3 w-24" />
      </div>
    </div>
  )
}

async function startSignin(redirect?: string | null) {
  const r = await fetch('/auth/signin/google', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect: redirect || undefined }) })
  const j = (await r.json().catch(() => null)) as SigninResp | null
  if (j && typeof j.authUrl === 'string') window.location.assign(j.authUrl)
}

export default function LoginPage() {
  const AudienceIcon = siteConfig.login.audienceIcon === "shield-check"
    ? ShieldCheck
    : GraduationCap
  const [passkeySupported, setPasskeySupported] = useState<boolean | null>(null)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [passkeyMessage, setPasskeyMessage] = useState<string | null>(null)
  const [checkingAccount, setCheckingAccount] = useState(true)

  useEffect(() => {
    const supported = browserSupportsWebAuthn()
    queueMicrotask(() => setPasskeySupported(supported))

    const checkAccount = async () => {
      try {
        const response = await fetch('/me', { cache: 'no-store', credentials: 'include' })
        const result = response.ok ? await response.json() as MeResponse : null
        if (result?.authenticated && result.consented) {
          window.location.replace('/verified')
          return
        }
      } catch {
        // The login screen remains available when no valid session can be confirmed.
      }
      setCheckingAccount(false)
    }
    void checkAccount()
  }, [])

  if (checkingAccount) {
    return <LoginPageSkeleton />
  }

  const getRedirect = () => {
    const rawRedirect = new URLSearchParams(window.location.search).get('redirect')
    return normalizeRedirectParam(rawRedirect) ?? normalizeRedirectParam(document.referrer)
  }

  const handleGoogleLogin = async () => {
    try {
      await startSignin(getRedirect())
    } catch (error) {
      console.error("Login error:", error)
    }
  }

  const handlePasskeyLogin = async () => {
    if (!browserSupportsWebAuthn()) {
      setPasskeySupported(false)
      setPasskeyMessage(siteConfig.login.passkeyUnsupported)
      return
    }

    setPasskeyBusy(true)
    setPasskeyMessage(null)
    try {
      const optionsResponse = await fetch('/auth/passkey/authentication/options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ redirect: getRedirect() || undefined }),
      })
      if (!optionsResponse.ok) throw new Error('options_failed')
      const optionsJSON = await optionsResponse.json() as Parameters<typeof startAuthentication>[0]['optionsJSON']
      const authenticationResponse = await startAuthentication({ optionsJSON })
      const verifyResponse = await fetch('/auth/passkey/authentication/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response: authenticationResponse }),
      })
      const result = await verifyResponse.json().catch(() => null) as PasskeyVerifyResp | null
      if (!verifyResponse.ok || !result?.success || typeof result.redirect !== 'string') {
        throw new Error(result?.error || 'verification_failed')
      }
      window.location.assign(result.redirect)
    } catch (error) {
      const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : null
      const errorName = error instanceof Error ? error.name : ''
      const causeName = cause instanceof Error ? cause.name : ''
      setPasskeyMessage(
        errorName === 'NotAllowedError' || causeName === 'NotAllowedError'
          ? siteConfig.login.passkeyCancelled
          : siteConfig.login.passkeyFailed,
      )
    } finally {
      setPasskeyBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >

        <div className="text-center mb-8 space-y-2">
          <Logo />
          <h1 className="text-3xl font-bold text-foreground">{siteConfig.login.heading}</h1>
        </div>

        <AuthCard
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/10 border border-primary/30">
              <AudienceIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm text-foreground/80">
                <p className="font-semibold text-foreground mb-1">{siteConfig.login.audienceHeading}</p>
                <p>{siteConfig.login.accountGuidance}</p>
              </div>
            </div>

            <button
              onClick={handleGoogleLogin}
              aria-label={siteConfig.login.googleButtonLabel}
              className="w-full rounded-xl bg-white text-[#1f1f1f] hover:bg-zinc-100 disabled:opacity-70 disabled:pointer-events-none shadow-sm border border-zinc-200 py-4 px-4 transition-colors flex items-center justify-center gap-3"
            >
              <span className="inline-flex items-center justify-center w-5 h-5">
                <svg viewBox="0 0 48 48" className="block w-5 h-5">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
              </span>
              <span className="text-sm font-medium">{siteConfig.login.googleButtonLabel}</span>
            </button>

            <button
              onClick={handlePasskeyLogin}
              disabled={passkeyBusy || passkeySupported === false}
              aria-label={siteConfig.login.passkeyButtonLabel}
              className="w-full rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 disabled:pointer-events-none border border-border py-4 px-4 transition-colors flex items-center justify-center gap-3"
            >
              <KeyRound className="w-5 h-5" />
              <span className="text-sm font-medium">
                {passkeyBusy ? siteConfig.passkey.processing : siteConfig.login.passkeyButtonLabel}
              </span>
            </button>

            {passkeySupported === false && !passkeyMessage && (
              <p role="status" className="text-sm text-auth-warning text-center">
                {siteConfig.login.passkeyUnsupported}
              </p>
            )}
            {passkeyMessage && (
              <p role="alert" className="text-sm text-auth-warning text-center">
                {passkeyMessage}
              </p>
            )}

            <p className="text-xs text-muted-foreground text-center">
              ログインすることで
              <Link href={siteConfig.publicInfo.termsUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                利用規約
              </Link>
              と
              <Link href={siteConfig.publicInfo.privacyPolicyUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                プライバシーポリシー
              </Link>
              に同意したものとみなされます
            </p>
          </div>
        </AuthCard>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-4 text-center"
        >
          <SupportLink />
        </motion.div>

      </motion.div>
    </div>
  )
}
