"use client"

import { motion } from "framer-motion"
import Link from "next/link"
 
import { GraduationCap } from "lucide-react"
import { Logo } from "@/components/ui/logo"
import { SupportLink } from "@/components/ui/support-link"

type SigninResp = { authUrl?: string }

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

async function startSignin(redirect?: string | null) {
  const r = await fetch('/auth/signin/google', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect: redirect || undefined }) })
  const j = (await r.json().catch(() => null)) as SigninResp | null
  if (j && typeof j.authUrl === 'string') window.location.assign(j.authUrl)
}

export default function LoginPage() {
  const termsUrl = process.env.NEXT_PUBLIC_TERMS_URL
  const privacyPolicyUrl = process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL

  const handleGoogleLogin = async () => {
    try {
      const rawRedirect = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('redirect')
      const referrer = typeof document !== 'undefined' ? document.referrer : null
      const redirect =
        normalizeRedirectParam(rawRedirect) ??
        normalizeRedirectParam(referrer)
      await startSignin(redirect)
    } catch (error) {
      console.error("Login error:", error)
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >

        <div className="text-center mb-8 space-y-2">
          <Logo />
          <h1 className="text-3xl font-bold text-white">ログイン</h1>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-2xl p-4"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/10 border border-primary/30">
              <GraduationCap className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm text-zinc-300">
                <p className="font-semibold text-white mb-1">ご利用いただく方へ</p>
                <p>大学から付与されたGoogleアカウントでログインしてください。</p>
              </div>
            </div>

            <button
              onClick={handleGoogleLogin}
              aria-label="Sign in with Google"
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
              <span className="text-sm font-medium">Googleでログイン</span>
            </button>

            <p className="text-xs text-zinc-500 text-center">
              ログインすることで
              {termsUrl ? (
                <Link href={termsUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                  利用規約
                </Link>
              ) : (
                <span className="text-zinc-500">利用規約</span>
              )}
              と
              {privacyPolicyUrl ? (
                <Link href={privacyPolicyUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                  プライバシーポリシー
                </Link>
              ) : (
                <span className="text-zinc-500">プライバシーポリシー</span>
              )}
              に同意したものとみなされます
            </p>
          </div>
        </motion.div>

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
