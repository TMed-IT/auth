"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { LogInIcon } from "lucide-react"
import { AuthCard } from "@/components/ui/auth-card"
import { Logo } from "@/components/ui/logo"
import siteConfig from "@site-config"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md text-center"
      >
        <div className="mb-8">
          <Logo />
        </div>

        <AuthCard
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="space-y-6">
            <div>
              <h1 className="text-6xl font-bold text-foreground mb-4">404</h1>
              <h2 className="text-2xl font-semibold text-foreground mb-2">ページが見つかりません</h2>
              <p className="text-muted-foreground">
                {siteConfig.notFound.description.map((line, index) => (
                  <span key={line}>
                    {index > 0 && <br />}
                    {line}
                  </span>
                ))}
              </p>
            </div>

            <Link
              href="/"
              className="w-full rounded-xl bg-auth-primary-strong text-primary-foreground hover:bg-auth-primary-strong/90 shadow-sm border border-auth-primary-strong py-4 px-4 transition-colors flex items-center justify-center gap-3 text-sm font-medium"
            >
              <LogInIcon className="w-5 h-5" />
              <span>{siteConfig.notFound.backButton}</span>
            </Link>
          </div>
        </AuthCard>
      </motion.div>
    </div>
  )
}
