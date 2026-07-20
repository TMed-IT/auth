"use client"

import { useState, useEffect } from "react"

import { motion } from "framer-motion"

import { Info, Loader2 } from "lucide-react"
import { Logo } from "@/components/ui/logo"
import { SupportLink } from "@/components/ui/support-link"
import {
  redirectToError,
  getErrorKeyFromResponse,
  getErrorKeyFromResultError,
} from "@/lib/error"

export default function ConsentPage() {
  const [submitting, setSubmitting] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false)
  const [csrfToken, setCsrfToken] = useState<string | null>(null)
  
  const termsUrl = process.env.NEXT_PUBLIC_TERMS_URL
  const privacyPolicyUrl = process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL

  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        const response = await fetch('/auth/consent', {
          method: 'GET',
          credentials: 'include',
        })
        
        if (!response.ok) {
          const { key, code } = await getErrorKeyFromResponse(response)
          redirectToError(key, code)
          return
        }
        const result = await response.json() as { csrfToken?: string }
        if (typeof result.csrfToken !== 'string') {
          redirectToError('consent_server_error')
          return
        }
        setCsrfToken(result.csrfToken)
      } catch (error) {
        console.error('CSRF token fetch failed:', error)
        redirectToError('consent_network_error')
      }
    }
    
    fetchCsrfToken()
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitting || !agreedToTerms || !agreedToPrivacy || !csrfToken) return
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
          agreedToTerms: true,
          agreedToPrivacy: true,
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
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="text-center mb-8 space-y-2">
          <Logo />
          <h1 className="text-3xl font-bold text-white">ようこそ</h1>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-2xl p-4"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="text-sm text-zinc-300">
                  <p >同意して続行ボタンを押すと、利用規約・プライバシーポリシーに同意したとみなされます。</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="flex items-start gap-3 p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 hover:border-zinc-600 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-zinc-900"
                />
                <div className="text-sm text-zinc-300 flex-1">
                  <p className="font-semibold text-white mb-1">
                    {termsUrl ? (
                      <a
                        href={termsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        利用規約
                      </a>
                    ) : (
                      <span className="text-zinc-500">利用規約</span>
                    )}
                    に同意します
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 hover:border-zinc-600 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={agreedToPrivacy}
                  onChange={(e) => setAgreedToPrivacy(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-zinc-900"
                />
                <div className="text-sm text-zinc-300 flex-1">
                  <p className="font-semibold text-white mb-1">
                    {privacyPolicyUrl ? (
                      <a
                        href={privacyPolicyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        プライバシーポリシー
                      </a>
                    ) : (
                      <span className="text-zinc-500">プライバシーポリシー</span>
                    )}
                    に同意します
                  </p>
                </div>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting || !agreedToTerms || !agreedToPrivacy || !csrfToken}
              className="w-full rounded-xl bg-white text-[#1f1f1f] hover:bg-zinc-100 disabled:opacity-70 disabled:pointer-events-none shadow-sm border border-zinc-200 py-4 px-4 transition-colors flex items-center justify-center gap-3 text-sm font-medium"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <span>同意して続行</span>
              )}
            </button>
          </form>
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


