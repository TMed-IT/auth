"use client"

import { useState, useEffect } from "react"

import { motion } from "framer-motion"

import { Info } from "lucide-react"
import { AccountCard, type AccountInfo } from "@/components/ui/account-card"
import { AuthCard } from "@/components/ui/auth-card"
import { Logo } from "@/components/ui/logo"
import { Skeleton } from "@/components/ui/skeleton"
import { SupportLink } from "@/components/ui/support-link"
import siteConfig from "@site-config"
import {
  redirectToError,
  getErrorKeyFromResponse,
  getErrorKeyFromResultError,
} from "@/lib/error"

export default function ConsentPage() {
  const [submitting, setSubmitting] = useState(false)
  const [agreements, setAgreements] = useState<boolean[]>(() => siteConfig.publicLinks.map(() => false))
  const allAgreed = siteConfig.publicLinks.every((_, index) => agreements[index] === true)
  const [csrfToken, setCsrfToken] = useState<string | null>(null)
  const [user, setUser] = useState<AccountInfo | null>(null)
  
  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        const meResponse = await fetch('/me', {
          cache: 'no-store',
          credentials: 'include',
        })
        const me = meResponse.ok
          ? await meResponse.json() as {
              authenticated?: boolean
              consented?: boolean
              user?: AccountInfo | null
            }
          : null
        if (me?.authenticated && me.consented && me.user) {
          window.location.replace('/verified')
          return
        }

        const response = await fetch('/auth/consent', {
          method: 'GET',
          credentials: 'include',
        })
        
        if (!response.ok) {
          const { key, code } = await getErrorKeyFromResponse(response)
          redirectToError(key, code)
          return
        }
        const result = await response.json() as {
          csrfToken?: string
          user?: AccountInfo
        }
        if (typeof result.csrfToken !== 'string' || !result.user?.email) {
          redirectToError('consent_server_error')
          return
        }
        setCsrfToken(result.csrfToken)
        setUser(result.user)
      } catch (error) {
        console.error('CSRF token fetch failed:', error)
        redirectToError('consent_network_error')
      }
    }
    
    fetchCsrfToken()
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitting || !allAgreed || !csrfToken) return
    setSubmitting(true)
    
    try {
      const response = await fetch('/auth/consent', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csrfToken,
          agreedLinks: siteConfig.publicLinks,
        }),
      })
      
      if (!response.ok) {
        const { key, code } = await getErrorKeyFromResponse(response)
        console.error('Consent error response:', { status: response.status })
        setSubmitting(false)
        redirectToError(key, code)
        return
      }
      
      const result = await response.json() as { success?: boolean; redirect?: string; error?: string }
      
      if (result.success && result.redirect) {
        window.location.replace(result.redirect)
      } else if (result.error) {
        setSubmitting(false)
        const { key, code } = getErrorKeyFromResultError(result.error)
        redirectToError(key, code)
      } else {
        window.location.replace(window.location.pathname)
      }
    } catch (error) {
      console.error('Consent request failed:', error)
      setSubmitting(false)
      redirectToError('consent_network_error')
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
          <h1 className="text-3xl font-bold text-foreground">{siteConfig.consent.heading}</h1>
        </div>

        <AuthCard
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {user && <AccountCard user={user} />}

            <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="text-sm text-foreground/80">
                  <p>{siteConfig.consent.description}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {siteConfig.publicLinks.map(({ label, url }, index) => (
                <label key={index} className="flex items-start gap-3 p-4 rounded-lg bg-secondary/70 border border-border hover:border-primary/70 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={agreements[index] === true}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setAgreements((current) => current.map((agreed, i) => i === index ? checked : agreed))
                    }}
                    className="mt-0.5 w-5 h-5 rounded border-border bg-secondary text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-card"
                  />
                  <div className="text-sm text-foreground/80 flex-1 min-w-0 break-words">
                    <p className="font-semibold text-foreground mb-1">
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {label}
                      </a>
                      に同意します
                    </p>
                  </div>
                </label>
              ))}
            </div>

            <button
              type="submit"
              disabled={submitting || !allAgreed || !csrfToken}
              className="w-full rounded-xl bg-auth-primary-strong text-primary-foreground hover:bg-auth-primary-strong/90 disabled:opacity-70 disabled:pointer-events-none shadow-sm border border-auth-primary-strong py-4 px-4 transition-colors flex items-center justify-center gap-3 text-sm font-medium"
            >
              {submitting ? (
                <>
                  <Skeleton className="h-4 w-28 bg-primary-foreground/30" />
                  <span className="sr-only">同意を処理しています</span>
                </>
              ) : (
                <span>{siteConfig.consent.submitButton}</span>
              )}
            </button>
          </form>
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
