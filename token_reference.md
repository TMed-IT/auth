## セッション連携リファレンス

認証サービスはD1に保存したサーバー側セッションを使用します。ブラウザの `__Host-session` Cookieには不透明なランダム値だけを保存し、認証ホスト以外には送信しません。各サブドメインからはブラウザ経由で認証サービスのセッションAPIを呼び出してください。

### 1. ログイン

1. `POST /auth/signin/google` を呼び出し、返された `authUrl` へ遷移します。
2. Google OAuth完了後、認証サービスがD1にセッションを作成し、不透明なIDを `__Host-session` Cookieへ設定します。
3. ログイン後は `AUTH_TRUSTED_ORIGINS` に登録されたサブドメイン、または `AUTH_DEFAULT_REDIRECT_URL` へ戻ります。

リクエストBodyの `redirect` を省略すると、サーバーが `Referer` または `Origin` から許可済みの戻り先を自動判別します。判別したURLはOAuth一時Cookieへ保存され、既存ユーザーはコールバック完了後、初回ユーザーは同意完了後に同じサブドメインへ戻ります。どの候補も許可リストと完全一致しない場合は `AUTH_DEFAULT_REDIRECT_URL` へフォールバックします。未設定の場合は、従来どおり `AUTH_URL` から算出したトップドメインを使います。

```ts
const AUTH_ORIGIN =
  process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.example.com";

export async function signIn() {
  const response = await fetch(`${AUTH_ORIGIN}/auth/signin/google`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to start sign in");

  const { authUrl } = (await response.json()) as { authUrl: string };
  window.location.assign(authUrl);
}
```

元のパス・クエリまで確実に戻す必要がある場合だけ、search paramsではなくJSON Bodyで指定します。

```ts
export async function signInAndReturnToCurrentUrl() {
  const response = await fetch(`${AUTH_ORIGIN}/auth/signin/google`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect: window.location.href }),
  });
  if (!response.ok) throw new Error("Failed to start sign in");

  const { authUrl } = (await response.json()) as { authUrl: string };
  window.location.assign(authUrl);
}
```

### 2. ログイン中のアカウント確認

利用するフロントエンドのサブドメインラベルを `AUTH_TRUSTED_ORIGINS` に登録し、次のように呼び出します。`AUTH_DEFAULT_REDIRECT_URL` のOriginも自動的に許可されます。

```ts
type SessionUser = {
  id: string;
  email: string;
  given_name: string;
  family_name: string;
  display_name: string | null;
  avatar: string | null;
  created_at: string;
  consented_at: string;
};

export async function fetchMe(): Promise<SessionUser | null> {
  const response = await fetch(`${AUTH_ORIGIN}/me`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch account");
  }

  const data = (await response.json()) as {
    authenticated: boolean;
    consented: boolean;
    user: SessionUser | null;
  };
  return data.authenticated && data.consented ? data.user : null;
}
```

`avatar` は認証サービス内の `/avatar/<hash>` です。別Originのフロントエンドで表示する場合は、`new URL(user.avatar, AUTH_ORIGIN)` で絶対URLへ変換してください。Googleの画像URLは返しません。

資格情報付きCORSではワイルドカードOriginを利用できないため、レスポンスの `Access-Control-Allow-Origin` はリクエストOriginとの完全一致時のみ返されます。

### 3. サインアウト

```ts
export async function signOut() {
  const tokenResponse = await fetch(`${AUTH_ORIGIN}/auth/signout`, {
    method: "GET",
    credentials: "include",
  });
  if (!tokenResponse.ok) throw new Error("Failed to prepare sign out");

  const { csrfToken } = (await tokenResponse.json()) as {
    csrfToken: string;
  };

  const response = await fetch(`${AUTH_ORIGIN}/auth/signout`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csrfToken }),
  });
  if (!response.ok) throw new Error("Failed to sign out");
}
```

### 4. セキュリティ要件

- セッションCookieを他サービスへ転送・共有しないでください。
- ブラウザからの呼び出しには必ず `credentials: "include"` を指定してください。
- `AUTH_TRUSTED_ORIGINS` には `app,admin,portal` のようにサブドメインラベルだけを登録してください。
- 完全URL、ドット、パス、ワイルドカードは記述できません。
- `NEXTJS_ENV=development` の場合だけ `localhost` または `localhost:ポート番号` を登録できます。
- 旧親ドメインCookieの削除対象Domainは `AUTH_URL` から自動算出されます。
- 認証・CSRF Cookieをログへ出力しないでください。
