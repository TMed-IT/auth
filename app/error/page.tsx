"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import Link from "next/link"
import { LogInIcon, AlertCircle } from "lucide-react"
import { Logo } from "@/components/ui/logo"
import { getErrorMessage, getErrorDetailMessage } from "@/lib/error"

function ErrorContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const key = searchParams.get("key")
    
    if (!key || key.trim() === "") {
      router.replace("/not-found")
      return
    }

    const baseMessage = getErrorMessage(key)
    
    if (!baseMessage) {
      router.replace("/not-found")
      return
    }

    const errorCode = searchParams.get("code")
    const detailMessage = errorCode ? getErrorDetailMessage(errorCode) : null
    
    const message = detailMessage || baseMessage
    setErrorMessage(message)
  }, [searchParams, router])

  if (!errorMessage) {
    return null
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
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-2xl p-4"
        >
          <div className="space-y-4 text-center">
            <div>
              <div className="flex justify-center mb-4">
                <AlertCircle className="w-16 h-16 text-red-500" />
              </div>
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
                <p className="text-sm text-red-300 whitespace-pre-wrap">
                  {errorMessage}
                </p>
              </div>
              <p className="text-zinc-400 text-sm">
                最初からやり直してください
              </p>
            </div>

            <Link
              href="/"
              className="w-full rounded-xl bg-white text-[#1f1f1f] hover:bg-zinc-100 shadow-sm border border-zinc-200 py-4 px-4 transition-colors flex items-center justify-center gap-3 text-sm font-medium"
            >
              <LogInIcon className="w-5 h-5" />
              <span>ログイン画面に戻る</span>
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

export default function ErrorPage() {
  return (
    <Suspense fallback={null}>
      <ErrorContent />
    </Suspense>
  )
}

