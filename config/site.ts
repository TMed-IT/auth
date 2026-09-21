export type ErrorKey =
  | "consent_error"
  | "consent_network_error"
  | "consent_server_error"
  | "consent_processing_failed"
  | "oauth_error"
  | "authorization_error"

export type ErrorCode =
  | "invalid_origin"
  | "expired_session"
  | "no_pending_user"
  | "invalid_pending_user"
  | "consent_required"
  | "csrf_token_invalid"
  | "email_not_allowlisted"
  | "database_error"
  | "processing_failed"
  | "access_denied"
  | "oauth_provider_error"
  | "invalid_state"
  | "invalid_callback"
  | "token_exchange_failed"
  | "invalid_id_token"
  | "userinfo_failed"
  | "identity_mismatch"
  | "email_not_verified"
  | "email_not_allowed"
  | "invalid_request"
  | "server_configuration_error"

export type SiteConfig = {
  auth: {
    allowSelfRegistration: boolean
  }
  metadata: {
    title: string
    language: string
  }
  brand: {
    organizationName: string
    logoPath: string
    faviconPath: string
  }
  theme: {
    background: string
    backgroundSecondary: string
    surface: string
    surfaceStrong: string
    foreground: string
    mutedForeground: string
    border: string
    primary: string
    primaryStrong: string
    primaryForeground: string
    success: string
    warning: string
    danger: string
  }
  publicInfo: {
    termsUrl: `https://${string}`
    privacyPolicyUrl: `https://${string}`
    supportEmail: `${string}@${string}`
  }
  login: {
    heading: string
    audienceIcon: "graduation-cap" | "shield-check"
    audienceHeading: string
    accountGuidance: string
    googleButtonLabel: string
    passkeyButtonLabel: string
    passkeyUnsupported: string
    passkeyCancelled: string
    passkeyFailed: string
  }
  passkey: {
    heading: string
    description: string
    nameLabel: string
    registerButton: string
    processing: string
    unsupported: string
    cancelled: string
    verificationFailed: string
    registeredHeading: string
    saveNameButton: string
    renameFailed: string
  }
  consent: {
    heading: string
    description: string
    submitButton: string
  }
  verified: {
    heading: string
    description: string
    consentedLabel: string
    continueButton: string
  }
  error: {
    messages: Record<ErrorKey, string>
    details: Record<ErrorCode, string>
    retryGuidance: string
    backButton: string
  }
  notFound: {
    description: readonly string[]
    backButton: string
  }
  support: {
    prefix: string
    linkLabel: string
  }
}

type SiteConfigDefinition = Pick<SiteConfig, "auth"> & {
  brand: SiteConfig["brand"]
  theme: SiteConfig["theme"]
  publicInfo: Pick<SiteConfig["publicInfo"], "termsUrl" | "privacyPolicyUrl">
  login: Pick<SiteConfig["login"], "audienceIcon" | "audienceHeading" | "accountGuidance">
  error: {
    emailNotAllowlisted: string
  }
}

export const defineSiteConfig = (config: SiteConfigDefinition): SiteConfig => ({
  auth: config.auth,
  metadata: {
    title: config.brand.organizationName,
    language: "ja",
  },
  brand: config.brand,
  theme: config.theme,
  publicInfo: {
    supportEmail: "support@tmedit.org",
    ...config.publicInfo,
  },
  login: {
    heading: "ログイン",
    ...config.login,
    googleButtonLabel: "Googleでログイン",
    passkeyButtonLabel: "パスキーでログイン",
    passkeyUnsupported: "このブラウザまたは端末ではパスキーを利用できません。",
    passkeyCancelled: "パスキーによるログインがキャンセルされました。",
    passkeyFailed: "パスキーを確認できませんでした。もう一度お試しください。",
  },
  passkey: {
    heading: "パスキーを登録",
    description: "この端末の画面ロックや生体認証を使って、次回からすばやく安全にログインできます。表示名は登録後の最後の画面で確認・変更できます。",
    nameLabel: "表示名",
    registerButton: "パスキーを登録",
    processing: "パスキーを確認しています…",
    unsupported: "このブラウザまたは端末ではパスキーを利用できません。",
    cancelled: "パスキーの登録がキャンセルされました。",
    verificationFailed: "パスキーを登録できませんでした。もう一度お試しください。",
    registeredHeading: "パスキーを登録しました",
    saveNameButton: "この名前で続行",
    renameFailed: "パスキーの名前を変更できませんでした。",
  },
  consent: {
    heading: "ようこそ",
    description: "同意して続行ボタンを押すと、利用規約・プライバシーポリシーに同意したとみなされます。",
    submitButton: "同意して続行",
  },
  verified: {
    heading: "おかえりなさい",
    description: "このアカウントでログインしています。",
    consentedLabel: "利用規約に同意済み",
    continueButton: "続ける",
  },
  error: {
    messages: {
      consent_error: "同意処理中にエラーが発生しました",
      consent_network_error: "ネットワークエラーが発生しました",
      consent_server_error: "サーバーでエラーが発生しました",
      consent_processing_failed: "認証処理中にエラーが発生しました",
      oauth_error: "Googleログインを完了できませんでした",
      authorization_error: "認証を続行できませんでした",
    },
    details: {
      invalid_origin: "リクエストの送信元が無効です",
      expired_session: "セッションの有効期限が切れています",
      no_pending_user: "セッション情報が見つかりません",
      invalid_pending_user: "ユーザー情報が無効です。",
      consent_required: "利用規約とプライバシーポリシーへの同意が必要です",
      csrf_token_invalid: "セキュリティトークンの検証に失敗しました",
      email_not_allowlisted: config.error.emailNotAllowlisted,
      database_error: "データベースへの接続に失敗しました",
      processing_failed: "認証処理中にエラーが発生しました",
      access_denied: "Googleログインがキャンセルされました",
      oauth_provider_error: "Googleで認証処理中にエラーが発生しました",
      invalid_state: "ログイン情報を確認できませんでした",
      invalid_callback: "Googleからの応答を確認できませんでした",
      token_exchange_failed: "Googleとの認証処理に失敗しました",
      invalid_id_token: "Googleアカウントを確認できませんでした",
      userinfo_failed: "Googleアカウントの情報を取得できませんでした",
      identity_mismatch: "Googleアカウントの情報が一致しませんでした",
      email_not_verified: "確認済みのメールアドレスが必要です",
      email_not_allowed: "このGoogleアカウントではログインできません",
      invalid_request: "連携元からのリクエストを確認できませんでした",
      server_configuration_error: "サーバーの設定を確認できませんでした",
    },
    retryGuidance: "最初からやり直してください",
    backButton: "ログイン画面に戻る",
  },
  notFound: {
    description: [
      "お探しのページは存在しないか、認証に失敗しました",
      "最初からやり直してください",
    ],
    backButton: "ログイン画面に戻る",
  },
  support: {
    prefix: "ご不明な点がある場合は、",
    linkLabel: "サポート",
  },
})
