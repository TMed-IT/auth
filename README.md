# TMed-IT Auth

Next.jsとCloudflare Workersで動く認証サービスです。Google OAuth 2.0とパスキーに対応し、セッションとユーザー情報はCloudflare D1、Googleプロフィール画像はR2で管理します。

同じコードから、用途の異なる2つのサイトをビルドします。

| サイト | 利用できるユーザー | Worker / D1 / R2 |
| --- | --- | --- |
| external | `AUTH_EMAIL_ALLOW_REGEX` に一致するGoogleアカウント。未登録者は同意後に作成する | `auth-external` |
| internal | D1の `users.email` に事前登録されたアカウント | `auth-internal` |

- [ローカルで起動する](#ローカルで起動する)
- [Google OAuthを設定する](#google-oauthを設定する)
- [環境変数](#環境変数)
- [API](#api)
- [デプロイ](#デプロイ)

## サイトごとの表示を変更する

サイト固有の組織名、ロゴ、favicon、配色、規約URL、ログイン案内は [`config/external.ts`](./config/external.ts) と [`config/internal.ts`](./config/internal.ts) にあります。共通の文言と問い合わせ先は [`config/site.ts`](./config/site.ts) で管理します。

画像は [`brand`](./brand) から各設定ファイルへimportします。ビルド時に `@site-config` が一方の設定だけを読み込むため、選ばなかったサイトの画像は成果物に含まれません。

## ローカルで起動する

Node.js 24とpnpmを使用します。

```bash
pnpm install
```

`.env.external.local` または `.env.internal.local` を作り、[環境変数](#環境変数)を設定します。`ENCRYPTION_SECRET` と `CSRF_SECRET` は未設定なら起動時に生成されます。再起動後も処理中の一時Cookieを維持したい場合は、それぞれに32バイト以上の固定値を設定してください。

```bash
openssl rand -base64 32
```

D1へスキーマを適用してから起動します。

```bash
# external: http://localhost:3000
pnpm run db:schema:external
pnpm run dev:external

# internal: http://localhost:3001
pnpm run db:schema:internal
pnpm run dev:internal
```

両方を同時に起動できます。Next.jsの出力先とローカルD1・R2の保存先はサイトごとに分かれています。別のポートを使う場合は、対応する `.env.<site>.local` の `AUTH_URL` を変更してください。

## Google OAuthを設定する

[Google Auth PlatformのClients画面](https://console.cloud.google.com/auth/clients)で「ウェブ アプリケーション」のOAuthクライアントを作成し、発行された値を `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` に設定します。

Google側には次のURLを登録します。

| 環境 | Authorized JavaScript origins | Authorized redirect URIs |
| --- | --- | --- |
| external（ローカル） | `http://localhost:3000` | `http://localhost:3000/auth/callback/google` |
| internal（ローカル） | `http://localhost:3001` | `http://localhost:3001/auth/callback/google` |
| 本番 | `AUTH_URL` のOrigin | `${AUTH_URL}/auth/callback/google` |

認可コードをサーバー側で交換するため、動作に必須なのはAuthorized redirect URIsです。Authorized JavaScript originsは、同じクライアントでブラウザ向けGoogle Identity Servicesを使う場合に備えて認証ホストのOriginへそろえます。

リダイレクトURIは、スキーム、ホスト、ポート、パス、末尾のスラッシュまで完全一致させてください。`AUTH_TRUSTED_ORIGINS` に登録したフロントエンドのURLはGoogle側へ登録する必要はありません。本番では、Google Auth PlatformのAuthorized domainsにもルートドメインを追加します。

## 認証データの扱い

externalはメールアドレスを `AUTH_EMAIL_ALLOW_REGEX` で確認し、未登録者を同意画面へ進めます。internalはD1の許可名簿にないアカウントを拒否します。どちらも同意済みのユーザーだけがセッションとパスキーを利用できます。

セッションCookieにはランダム値だけを保存し、D1にはそのSHA-256ハッシュを保存します。`GET /me` は呼び出すたびにセッションの有効期限、ユーザーの存在、同意状態を確認します。

Googleプロフィール画像は、正規化したメールアドレスのSHA-256ハッシュをキーとしてR2へコピーします。同じユーザーの再ログインでは同じオブジェクトを上書きするため、保存される画像は1ユーザーにつき1つです。D1にはGoogleのURLではなく `/avatar/<hash>` を保存します。

パスキーの登録後は、端末と認証器から推定した名前を表示します。利用者は保存前に変更できます。認証チャレンジはD1で一度だけ消費し、同じ署名の再送や同時送信によるセッション再発行を防ぎます。

## internalの許可名簿へ追加する

ローカルD1へ追加します。複数のメールアドレスも指定できます。

```bash
pnpm run whitelist:add:internal -- user@example.com
```

本番D1へ追加する場合は `--remote` を付けます。

```bash
pnpm run whitelist:add:internal -- user@example.com --remote
```

既存のユーザー情報は上書きしません。

## フロントエンドから利用する

利用元のサブドメインラベルをカンマ区切りで指定します。

```dotenv
AUTH_URL=https://auth.example.com
AUTH_TRUSTED_ORIGINS=app,admin,portal
```

この例では `https://app.example.com` などが許可されます。ラベルには英小文字、数字、ハイフンを使用できます。完全なURL、ドット、パス、ワイルドカードは指定できません。開発環境では `localhost` と `localhost:<port>` も使用できます。

ブラウザからAPIを呼ぶときは `credentials: "include"` を付けます。認証後に元のページへ戻す場合は、`POST /auth/signin/google` のJSON本文へ `redirect` を渡してください。指定がない場合は `Referer`、`Origin`、`AUTH_DEFAULT_REDIRECT_URL` の順に戻り先を決めます。

クライアント側の実装例は [`token_reference.md`](./token_reference.md) を参照してください。

## API

| Method | Path | 内容 |
| --- | --- | --- |
| `POST` | `/auth/signin/google` | Google認可URLを発行する |
| `GET` | `/auth/callback/google` | Googleの応答を検証し、ログインまたは同意画面へ進める |
| `GET` | `/auth/consent` | 同意用のCSRFトークンとアカウント情報を返す |
| `POST` | `/auth/consent` | 同意を記録し、セッションを作成する |
| `GET` | `/me` | セッションと同意状態を検証し、現在のユーザーを返す |
| `GET` | `/avatar/:hash` | R2のプロフィール画像を配信する |
| `GET` | `/auth/signout` | サインアウト用のCSRFトークンを発行する |
| `POST` | `/auth/signout` | セッションを失効させる |
| `POST` | `/auth/passkey/authentication/options` | パスキー認証チャレンジを発行する |
| `POST` | `/auth/passkey/authentication/verify` | 署名を検証してセッションを作成する |
| `POST` | `/auth/passkey/registration/options` | パスキー登録オプションを発行する |
| `POST` | `/auth/passkey/registration/verify` | パスキーを検証して保存する |
| `GET` | `/auth/passkeys` | 登録済みパスキーを返す |
| `PATCH` | `/auth/passkeys/:credentialId` | パスキーの表示名を変更する |
| `DELETE` | `/auth/passkeys/:credentialId` | パスキーを削除する |
| `GET` | `/auth/emdash/authorize` | EmDash向けの短寿命認可コードを発行する |
| `POST` | `/auth/emdash/token` | PKCEを検証して認可コードを交換する |

EmDashのコールバックURLは `https://<site-domain>/_emdash/api/auth/callback` に固定されています。EmDashのサブドメインラベルも `AUTH_TRUSTED_ORIGINS` に追加してください。

## 環境変数

### 必須

| 変数 | 説明 |
| --- | --- |
| `AUTH_URL` | 認証サービスのOrigin |
| `SESSION_MAX_AGE` | セッションの有効期間（秒） |
| `GOOGLE_CLIENT_ID` | Google OAuthクライアントID |
| `GOOGLE_CLIENT_SECRET` | Google OAuthクライアントシークレット |
| `D1_DATABASE_NAME` | D1名。`auth-external` または `auth-internal` |
| `D1_DATABASE_ID` | D1 ID |
| `R2_AVATAR_BUCKET_NAME` | R2バケット名。`D1_DATABASE_NAME` と同じ値 |

externalでは `AUTH_EMAIL_ALLOW_REGEX` も必須です。

### 任意

| 変数 | 説明 | 既定値 |
| --- | --- | --- |
| `AUTH_DEFAULT_REDIRECT_URL` | 戻り元がない場合の遷移先 | `AUTH_URL` から算出したトップドメイン |
| `AUTH_TRUSTED_ORIGINS` | 利用を許可するサブドメインラベル | 未指定 |
| `TEMP_COOKIE_MAX_AGE` | OAuth・同意用Cookieの有効期間（秒） | `180` |
| `NEXTJS_ENV` | `development` または `production` | URLから自動判定 |
| `ENCRYPTION_SECRET` | 一時Cookieの暗号鍵 | 開発時・デプロイ時に生成 |
| `CSRF_SECRET` | CSRFトークンの暗号鍵 | 開発時・デプロイ時に生成 |

## dotenvxで環境ファイルを管理する

本番用の値は `.env.external` と `.env.internal` に暗号化してコミットします。復号鍵は、それぞれ `DOTENV_PRIVATE_KEY_EXTERNAL` と `DOTENV_PRIVATE_KEY_INTERNAL` です。ローカル専用の平文値はGit管理外の `.env.external.local` または `.env.internal.local` に置きます。

```bash
pnpm exec dotenvx set KEY=value --file .env.external
pnpm exec dotenvx encrypt --file .env.external

pnpm exec dotenvx set KEY=value --file .env.internal
pnpm exec dotenvx encrypt --file .env.internal
```

## よく使うコマンド

| コマンド | 内容 |
| --- | --- |
| `pnpm run dev:external` | externalをポート3000で起動する |
| `pnpm run dev:internal` | internalをポート3001で起動する |
| `pnpm run build:external` | externalをビルドする |
| `pnpm run build:internal` | internalをビルドする |
| `pnpm run deploy:external` | externalをデプロイする |
| `pnpm run deploy:internal` | internalをデプロイする |
| `pnpm run db:schema:<site>` | ローカルD1へスキーマを適用する |
| `pnpm run db:list:<site>` | ローカルD1のユーザーを表示する |
| `pnpm run db:reset:<site>` | ローカルD1の対象テーブルを作り直す |
| `pnpm run whitelist:add:internal -- <email>` | internalの許可名簿へ追加する |
| `pnpm lint` | ESLintを実行する |
| `pnpm test` | テストを実行する |
| `pnpm run cf-typegen` | Cloudflare bindingの型を生成する |

`<site>` は `external` または `internal` です。`db:reset:*` は対象テーブルのデータを削除します。

## デプロイ

GitHub Organizationの **Settings → Secrets and variables → Actions** に次のOrganization Secretsを登録し、このリポジトリから利用できるようにします。

| Secret | 用途 |
| --- | --- |
| `DOTENV_PRIVATE_KEY_EXTERNAL` | `.env.external` の復号 |
| `DOTENV_PRIVATE_KEY_INTERNAL` | `.env.internal` の復号 |

`CLOUDFLARE_ACCOUNT_ID` は同じ画面のOrganization Variablesへ登録します。同名のRepository VariablesやEnvironment Variablesは作成しないでください。

`CLOUDFLARE_API_TOKEN` はGitHub Secretsへ登録します。APIトークンにはWorkers Scripts Edit、D1 Edit、Workers R2 Storage Editが必要です。

`main` へのpush時にlint、型検査、テスト、依存関係の監査を実行し、成功後にexternalとinternalをデプロイします。各ジョブはR2バケットを必要に応じて作成し、D1へ [`schema.sql`](./schema.sql) を適用します。

手元からデプロイする場合はWranglerへログインして実行します。

```bash
pnpm run deploy:external
pnpm run deploy:internal
```

デプロイのたびに `ENCRYPTION_SECRET` と `CSRF_SECRET` が更新されるため、処理中の同意、パスキー認証、CSRFトークンは失効します。D1のユーザー、セッション、パスキーとR2の画像は残ります。

## セキュリティ上の制約

- Cookieには `Secure`、`HttpOnly`、`SameSite=Lax`、`Path=/` を設定し、`Domain` は設定しません。
- 同意とサインアウトではCSRFトークンに加えて `Origin` または `Referer` を検証します。
- 認証後の遷移先は `AUTH_DEFAULT_REDIRECT_URL`、`AUTH_TRUSTED_ORIGINS`、認証サービス内の許可済みURLに限定します。
- Googleプロフィール画像はHTTPSの `googleusercontent.com` からのみ取得し、2 MiBを上限とします。
- 旧JWT Cookieは削除し、認証には使用しません。
