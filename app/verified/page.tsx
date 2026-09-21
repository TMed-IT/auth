"use client"

import { motion } from "framer-motion"
import { ArrowRight, CheckCircle2 } from "lucide-react"
import { useEffect, useState } from "react"

import { AccountCard, AccountCardSkeleton, type AccountInfo } from "@/components/ui/account-card"
import { AuthCard } from "@/components/ui/auth-card"
import { Logo } from "@/components/ui/logo"
import { Skeleton } from "@/components/ui/skeleton"
import { SupportLink } from "@/components/ui/support-link"
import siteConfig from "@site-config"

type MeResponse = {
  authenticated?: boolean
  consented?: boolean
  user?: AccountInfo | null
  defaultRedirectUrl?: string | null
}

export default function VerifiedPage() {
  const [user, setUser] = useState<AccountInfo | null>(null)
  const [defaultRedirectUrl, setDefaultRedirectUrl] = useState<string | null>(null)

  useEffect(() => {
    const verify = async () => {
      try {
        const response = await fetch('/me', { cache: 'no-store', credentials: 'include' })
        const result = response.ok ? await response.json() as MeResponse : null
        if (!result?.authenticated || !result.consented || !result.user) {
          window.location.replace('/')
          return
        }
        setUser(result.user)
        setDefaultRedirectUrl(result.defaultRedirectUrl || null)
      } catch {
        window.location.replace('/')
      }
    }
    void verify()
  }, [])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="mb-8 space-y-2 text-center">
          <Logo />
          <h1 className="text-3xl font-bold text-foreground">{siteConfig.verified.heading}</h1>
          <p className="text-sm text-muted-foreground">{siteConfig.verified.description}</p>
        </div>

        <AuthCard>
          {user ? (
            <div className="space-y-4">
              <AccountCard user={user} />
              <div className="flex items-center justify-center gap-2 text-sm text-auth-success">
                <CheckCircle2 className="size-4" />
                <span>{siteConfig.verified.consentedLabel}</span>
              </div>
              {defaultRedirectUrl && (
                <a
                  href={defaultRedirectUrl}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-auth-primary-strong px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-auth-primary-strong/90"
                >
                  <span>{siteConfig.verified.continueButton}</span>
                  <ArrowRight className="size-4" />
                </a>
              )}
            </div>
          ) : (
            <div className="space-y-4" role="status" aria-busy="true">
              <span className="sr-only">アカウントを確認しています</span>
              <AccountCardSkeleton />
              <Skeleton className="mx-auto h-4 w-36" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          )}
        </AuthCard>

        <div className="mt-4 text-center"><SupportLink /></div>
      </motion.div>
    </div>
  )
}
