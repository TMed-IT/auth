"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { ErrorScreen } from "@/components/ui/error-screen"
import { getErrorMessage, getErrorDetailMessage } from "@/lib/error"
import siteConfig from "@site-config"

function ErrorContent() {
  const searchParams = useSearchParams()
  const key = searchParams.get("key")
  const code = searchParams.get("code")
  const baseMessage = key ? getErrorMessage(key) : null
  const message = baseMessage
    ? (code ? getErrorDetailMessage(code) : null) || baseMessage
    : siteConfig.error.messages.authorization_error

  return <ErrorScreen message={message} />
}

export default function ErrorPage() {
  return (
    <Suspense fallback={<ErrorScreen message={siteConfig.error.messages.authorization_error} />}>
      <ErrorContent />
    </Suspense>
  )
}
