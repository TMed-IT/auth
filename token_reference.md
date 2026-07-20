## auth_token リファレンス

このドキュメントは Mahora Auth が発行する `auth_token`（JWT）の取得方法、利用方法、実装例、およびペイロード構造をまとめたものです。アプリ間で安全にセッションを共有する際の指針として活用してください。

---

### 1. auth_token の取得方法

1. フロントエンドまたはネイティブクライアントから `POST /auth/signin/google` を呼び出し、レスポンスで返る `authUrl` へリダイレクトします。  
2. Google OAuth 完了後、`GET /auth/callback/google` に戻ります。許可されたユーザーであれば `generateJWT` によって HS256 署名済みの JWT が生成され、`setAuthCookie` が `auth_token` を HttpOnly/SameSite=Lax クッキーとして設定します。  
3. クッキーは `AUTH_COOKIE_DOMAIN` 全体で共有され、以降は同一トップレベルドメイン配下の各サブドメインから自動送信されます。ブラウザ JS からは直接参照できないため、API との通信時は `credentials: 'include'` を必ず指定してください。  
4. ローカル開発でも `.dev.vars` に同じ `JWT_SECRET` を設定しておけば、本番と同じフローでクッキーが払い出されます。

---

### 2. auth_token の使い方

- **セッション確認（推奨ルート）**  
  - サブドメイン側フロントエンドは、アプリ起動時に `GET /auth/session` を `credentials: 'include'` 付きで呼び出します。  
  - サービス側では `getAuthCookie` でクッキーを取得→`verifyJWT` で署名検証→Cloudflare D1 からユーザー情報を返却しています。レスポンス `user` が `null` の場合は再ログインさせてください。

- **バックエンドで直接検証したい場合**  
  - `auth_token` を読み取り、下記 TypeScript 実装例の通り HS256 で署名検証します。  
  - すべての検証対象サービスで **同じ `JWT_SECRET`** を共有する必要があります。  
  - 検証後は `payload.sub`（ユーザー ID）をキーにアプリ独自の権限情報へマッピングします。

- **サインアウト**  
  - `/auth/signout` で CSRF トークンの払い出し→POST で検証→`deleteAuthCookie` によってクッキーを破棄します。ユーザー ID にバインドされた CSRF のため、必ずこのエンドポイント経由でログアウトフローを実装してください。

---

### 3. TypeScript 実装例

#### 3-1. ブラウザからセッションを取得する関数

```ts
const AUTH_ORIGIN = process.env.NEXT_PUBLIC_AUTH_URL ?? 'https://auth.example.com';

export async function fetchSession() {
  const response = await fetch(`${AUTH_ORIGIN}/auth/session`, {
    method: 'GET',
    credentials: 'include', // HttpOnly クッキーを送信
  });

  if (!response.ok) {
    throw new Error('Failed to fetch session');
  }

  const data: { user: null | { id: string; email: string; given_name: string; family_name: string; display_name: string | null; created_at: string } } =
    await response.json();

  return data.user; // null の場合は未認証
}
```

#### 3-2. API Route / Edge Middleware での JWT 検証

```ts
type JwtPayload = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  iat: number;
  exp: number;
};

const textEncoder = new TextEncoder();

const base64UrlToBytes = (value: string) => {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const binary = Buffer.from(normalized, 'base64');
  return new Uint8Array(binary);
};

export async function verifyAuthToken(token: string): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  const data = `${headerB64}.${payloadB64}`;
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');

  const key = await crypto.subtle.importKey('raw', textEncoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const isValid = await crypto.subtle.verify('HMAC', key, base64UrlToBytes(signatureB64), textEncoder.encode(data));
  if (!isValid) return null;

  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as JwtPayload;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

  return payload;
}
```

使用例:

```ts
export async function getCurrentUser(req: Request) {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const token = cookieHeader.split(/;\s*/).find((c) => c.startsWith('auth_token='))?.split('=').slice(1).join('=');
  if (!token) return null;

  const payload = await verifyAuthToken(decodeURIComponent(token));
  if (!payload) return null;

  return { id: payload.sub, email: payload.email, name: payload.name };
}
```

---

### 4. JWT の中身（ペイロード仕様）

| フィールド | 型 | 説明 |
|-----------|----|------|
| `sub` | string | Cloudflare D1 `users.id`。アプリ側でのユーザー固有 ID として利用します。 |
| `email` | string | Google で確認済みのメールアドレス。`AUTH_EMAIL_ALLOW_REGEX` を通過した値のみ格納。 |
| `name` | string | 一般的には `family_name + ' ' + given_name` 形式で保存。 |
| `picture` | string \| undefined | Google プロフィール画像 URL。存在しない場合は省略。 |
| `iat` | number | 発行時刻（UNIX 秒）。 |
| `exp` | number | 失効時刻（UNIX 秒）。`iat + AUTH_TOKEN_MAX_AGE` で算出。 |

追加の権限情報は JWT には入れず、`/auth/session` のレスポンスに含めるか、アプリケーション DB で参照してください。ペイロードを軽量に保つことで署名検証コストと漏洩リスクを低減します。

---

### 5. ベストプラクティス

- `AUTH_COOKIE_DOMAIN` は `.` プレフィックス付きのルートドメイン（例: `.example.com`）を設定し、HTTPS 配下のみでクッキーが送信されるよう `NODE_ENV=production` では `Secure` 属性が自動付与されます。  
- `JWT_SECRET` を環境ごとに管理し、漏洩時は速やかにローテーション + 既存セッションの失効を行ってください。  
- API から `auth_token` を読むときは URL デコードを忘れず、ログには決して出力しないでください。  
- ブラウザフェッチ時に `credentials: 'include'` を付け忘れると常に未認証判定になるため、共通クライアントを用意して確実に設定しましょう。
