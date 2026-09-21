import siteConfig from "@site-config"
import type { ErrorKey } from "@/config/site"

export type { ErrorKey } from "@/config/site"

export const ERROR_MESSAGES: Record<ErrorKey, string> = siteConfig.error.messages

export function getErrorDetailMessage(errorCode: string): string | null {
  return errorCode in siteConfig.error.details
    ? siteConfig.error.details[errorCode as keyof typeof siteConfig.error.details]
    : null
}

export function getErrorMessage(key: string): string | null {
  if (isValidErrorKey(key)) {
    return ERROR_MESSAGES[key]
  }
  return null
}

export function isValidErrorKey(key: string): key is ErrorKey {
  return key in ERROR_MESSAGES
}

export function redirectToError(key: ErrorKey, errorCode?: string): void {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams({ key })
    if (errorCode) {
      params.set("code", errorCode)
    }
    window.location.replace(`/error?${params.toString()}`)
  }
}

export async function getErrorKeyFromResponse(
  response: Response
): Promise<{ key: ErrorKey; code?: string }> {
  const contentType = response.headers.get("content-type")
  
  if (contentType && contentType.includes("application/json")) {
    try {
      const error = (await response.json()) as { error?: string }
      if (error.error === "processing_failed") {
        return { key: "consent_processing_failed", code: error.error }
      }
      return { key: "consent_error", code: error.error }
    } catch {
      return { key: "consent_server_error" }
    }
  }
  
  return { key: "consent_server_error" }
}

export function getErrorKeyFromResultError(
  error: string | undefined
): { key: ErrorKey; code?: string } {
  if (error === "processing_failed") {
    return { key: "consent_processing_failed", code: error }
  }
  return { key: "consent_error", code: error }
}
