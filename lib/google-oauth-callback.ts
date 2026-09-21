import type { ErrorCode } from "@/config/site"

type CallbackInput = {
  code: string | null
  state: string | null
  providerError: string | null
  storedState: string | null
  storedNonce: string | null
  storedVerifier: string | null
}

type CallbackResult =
  | {
      ok: true
      code: string
      nonce: string
      verifier: string
    }
  | {
      ok: false
      error: ErrorCode
    }

export const validateGoogleOAuthCallback = ({
  code,
  state,
  providerError,
  storedState,
  storedNonce,
  storedVerifier,
}: CallbackInput): CallbackResult => {
  if (!state || !storedState || state !== storedState) {
    return { ok: false, error: "invalid_state" }
  }

  if (providerError) {
    return {
      ok: false,
      error: providerError === "access_denied" ? "access_denied" : "oauth_provider_error",
    }
  }

  if (!code) {
    return { ok: false, error: "invalid_callback" }
  }

  if (!storedNonce || !storedVerifier) {
    return { ok: false, error: "invalid_state" }
  }

  return {
    ok: true,
    code,
    nonce: storedNonce,
    verifier: storedVerifier,
  }
}
