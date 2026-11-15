"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { LogInIcon } from "lucide-react"
import { AuthCard } from "@/components/ui/auth-card"
import { Logo } from "@/components/ui/logo"
import siteConfig from "@site-config"

export function ErrorScreen({ message }: { message: string }) {
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
        </div>

        <AuthCard
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="space-y-4 text-center">
            <h1 className="text-xl font-semibold">処理を完了できませんでした</h1>
            <div>
              <div className="bg-auth-danger/10 border border-auth-danger/30 rounded-lg p-4 mb-4">
                <p className="text-sm text-auth-danger whitespace-pre-wrap">
                  {message}
                </p>
              </div>
              <p className="text-muted-foreground text-sm">
                {siteConfig.error.retryGuidance}
              </p>
            </div>

            <Link
              href="/"
              className="w-full rounded-xl bg-auth-primary-strong text-primary-foreground hover:bg-auth-primary-strong/90 shadow-sm border border-auth-primary-strong py-4 px-4 transition-colors flex items-center justify-center gap-3 text-sm font-medium"
            >
              <LogInIcon className="w-5 h-5" />
              <span>{siteConfig.error.backButton}</span>
            </Link>
          </div>
        </AuthCard>
      </motion.div>
    </div>
  )
}
