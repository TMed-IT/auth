"use client"

import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser"
import { motion } from "framer-motion"
import { KeyRound } from "lucide-react"
import { FormEvent, useEffect, useState } from "react"

import { Logo } from "@/components/ui/logo"
import { AuthCard } from "@/components/ui/auth-card"
import { SupportLink } from "@/components/ui/support-link"
import siteConfig from "@site-config"

type SessionResponse = { user?: { id?: string } | null }
type VerifyResponse = {
  success?: boolean
  redirect?: string
  credentialId?: string
  name?: string
  error?: string
}
type PasskeyListResponse = { csrfToken?: string }
type RenameResponse = { success?: boolean; name?: string; error?: string }
type RegisteredPasskey = { id: string; name: string; redirect: string }

export default function PasskeyRegistrationPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [supported, setSupported] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [registeredPasskey, setRegisteredPasskey] = useState<RegisteredPasskey | null>(null)
  const [name, setName] = useState("")
  const [csrfToken, setCsrfToken] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const webAuthnSupported = browserSupportsWebAuthn()
    queueMicrotask(() => setSupported(webAuthnSupported))

    const loadSession = async () => {
      try {
        const response = await fetch('/me', { cache: 'no-store', credentials: 'include' })
        const session = response.ok ? await response.json() as SessionResponse : null
        if (!session?.user?.id) {
          const continuation = window.location.href
          window.location.replace(`/?redirect=${encodeURIComponent(continuation)}`)
          return
        }
        setAuthenticated(true)
      } catch {
        setMessage(siteConfig.passkey.verificationFailed)
      } finally {
        setCheckingSession(false)
      }
    }
    void loadSession()
  }, [])

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!browserSupportsWebAuthn()) {
      setSupported(false)
      setMessage(siteConfig.passkey.unsupported)
      return
    }

    setBusy(true)
    setMessage(null)
    try {
      const redirect = new URLSearchParams(window.location.search).get('redirect')
      const optionsResponse = await fetch('/auth/passkey/registration/options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ redirect: redirect || undefined }),
      })
      if (optionsResponse.status === 401) {
        window.location.replace(`/?redirect=${encodeURIComponent(window.location.href)}`)
        return
      }
      if (!optionsResponse.ok) throw new Error('options_failed')

      const optionsJSON = await optionsResponse.json() as Parameters<typeof startRegistration>[0]['optionsJSON']
      const registrationResponse = await startRegistration({ optionsJSON })
      const verifyResponse = await fetch('/auth/passkey/registration/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response: registrationResponse }),
      })
      const result = await verifyResponse.json().catch(() => null) as VerifyResponse | null
      if (
        !verifyResponse.ok ||
        !result?.success ||
        typeof result.redirect !== 'string' ||
        typeof result.credentialId !== 'string' ||
        typeof result.name !== 'string'
      ) {
        throw new Error(result?.error || 'verification_failed')
      }

      setRegisteredPasskey({
        id: result.credentialId,
        name: result.name,
        redirect: result.redirect,
      })
      setName(result.name)

      const listResponse = await fetch('/auth/passkeys', { cache: 'no-store' }).catch(() => null)
      if (listResponse?.ok) {
        const list = await listResponse.json() as PasskeyListResponse
        if (typeof list.csrfToken === 'string') setCsrfToken(list.csrfToken)
      }
    } catch (error) {
      const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : null
      const errorName = error instanceof Error ? error.name : ''
      const causeName = cause instanceof Error ? cause.name : ''
      setMessage(
        errorName === 'NotAllowedError' || causeName === 'NotAllowedError'
          ? siteConfig.passkey.cancelled
          : siteConfig.passkey.verificationFailed,
      )
    } finally {
      setBusy(false)
    }
  }

  const handleFinish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!registeredPasskey) return
    const normalizedName = name.trim()
    if (!normalizedName || Array.from(normalizedName).length > 64) return

    if (normalizedName === registeredPasskey.name) {
      window.location.assign(registeredPasskey.redirect)
      return
    }
    if (!csrfToken) {
      setMessage(siteConfig.passkey.renameFailed)
      return
    }

    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(
        `/auth/passkeys/${encodeURIComponent(registeredPasskey.id)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ csrfToken, name: normalizedName }),
        },
      )
      const result = await response.json().catch(() => null) as RenameResponse | null
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'rename_failed')
      }
      window.location.assign(registeredPasskey.redirect)
    } catch {
      setMessage(siteConfig.passkey.renameFailed)
    } finally {
      setBusy(false)
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
          <h1 className="text-3xl font-bold text-foreground">
            {registeredPasskey ? siteConfig.passkey.registeredHeading : siteConfig.passkey.heading}
          </h1>
        </div>

        <AuthCard>
          {!registeredPasskey ? (
            <>
              <div className="flex items-start gap-3 mb-6">
                <KeyRound className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                <p className="text-sm leading-6 text-foreground/80">{siteConfig.passkey.description}</p>
              </div>

              <form onSubmit={handleRegister}>
                <button
                  type="submit"
                  disabled={!authenticated || busy || supported === false}
                  className="w-full rounded-xl bg-auth-primary-strong text-primary-foreground hover:bg-auth-primary-strong/90 disabled:opacity-50 disabled:pointer-events-none py-4 px-4 transition-colors font-medium"
                >
                  {busy || checkingSession ? siteConfig.passkey.processing : siteConfig.passkey.registerButton}
                </button>
              </form>

              {supported === false && !message && (
                <p role="status" className="mt-4 text-sm text-auth-warning text-center">
                  {siteConfig.passkey.unsupported}
                </p>
              )}
            </>
          ) : (
            <form onSubmit={handleFinish} className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-foreground/90">
                  {siteConfig.passkey.nameLabel}
                </span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={64}
                  autoFocus
                  disabled={busy}
                  required
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary disabled:opacity-50"
                />
              </label>
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="w-full rounded-xl bg-auth-primary-strong text-primary-foreground hover:bg-auth-primary-strong/90 disabled:opacity-50 disabled:pointer-events-none py-4 px-4 transition-colors font-medium"
              >
                {busy ? siteConfig.passkey.processing : siteConfig.passkey.saveNameButton}
              </button>
            </form>
          )}

          {message && (
            <p role="alert" className="mt-4 text-sm text-auth-warning text-center">{message}</p>
          )}
        </AuthCard>

        <div className="mt-4 text-center"><SupportLink /></div>
      </motion.div>
    </div>
  )
}
