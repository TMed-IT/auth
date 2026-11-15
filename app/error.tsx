"use client"

import { ErrorScreen } from "@/components/ui/error-screen"

export default function ErrorBoundary() {
  return <ErrorScreen message="一時的な問題が発生しました。しばらくしてから、もう一度お試しください。" />
}
