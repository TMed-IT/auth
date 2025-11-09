export type ErrorKey =
  | "consent_error"
  | "consent_network_error"
  | "consent_server_error"
  | "consent_processing_failed"

const ERROR_DETAIL_MESSAGES: Record<string, string> = {
  invalid_origin: "リクエストの送信元が無効です",
  expired_session: "セッションの有効期限が切れています",
  no_pending_user: "セッション情報が見つかりません",
  invalid_pending_user: "ユーザー情報が無効です。",
  csrf_token_invalid: "セキュリティトークンの検証に失敗しました",
  database_error: "データベースへの接続に失敗しました",
  processing_failed: "認証処理の処理中にエラーが発生しました",
}

export const ERROR_MESSAGES: Record<ErrorKey, string> = {
  consent_error: "同意処理中にエラーが発生しました",
  consent_network_error: "ネットワークエラーが発生しました",
  consent_server_error: "サーバーでエラーが発生しました",
  consent_processing_failed: "認証処理の処理中にエラーが発生しました",
}

export function getErrorDetailMessage(errorCode: string): string | null {
  return ERROR_DETAIL_MESSAGES[errorCode] || null
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

