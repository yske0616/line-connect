# LINE Connect for GoHighLevel

GHLマーケットプレイスアプリ「LINE Connect」のサーバー。
GoHighLevelのワークフロービルダーにLINE Messaging API機能をネイティブ追加する。

## Phase 1 実装内容

- ✅ GHL OAuth認証フロー
- ✅ LINE Webhook受信エンドポイント
- ✅ カスタムワークフロートリガー: LINE Friend Added / LINE Message Received
- ✅ カスタムワークフローアクション: Send LINE Text
- ✅ コンタクト自動作成（line_uid保存 + タグ付与）
- ✅ 初期設定画面（LINE接続設定）
- ✅ PostgreSQL + マルチテナント設計
- ✅ Railway デプロイ設定

## アーキテクチャ

```
LINE Platform → POST /webhook/{locationId} → LINE Connect Server → GHL API v2
GHL Workflow  → POST /actions/send-line-text → LINE Connect Server → LINE Push API
GHL Workflow  → POST /triggers/subscribe → LINE Connect Server → DB保存
LINE Follow   → LINE Connect Server → POST targetUrl → GHL Workflow起動
```

## セットアップ手順

### 1. リポジトリのクローン & 依存関係インストール

```bash
cd line-connect
npm install
```

### 2. 環境変数設定

```bash
cp .env.example .env
# .envを編集してGHLとLINEの認証情報を設定
```

### 3. PostgreSQLデータベース作成

```bash
# ローカルの場合
createdb line_connect

# マイグレーション実行
npm run migrate
```

### 4. ローカル開発サーバー起動

```bash
npm run dev
```

サーバーは http://localhost:3000 で起動します。

### 5. ngrokでローカルを公開（Webhook テスト用）

```bash
ngrok http 3000
# → https://xxxx.ngrok.io が払い出される
```

LINE DevelopersのWebhook URLに `https://xxxx.ngrok.io/webhook/{locationId}` を設定。

---

## Railway へのデプロイ

### 1. GitHubリポジトリを作成してpush

```bash
git init
git add .
git commit -m "Initial commit: LINE Connect for GoHighLevel Phase 1"
git remote add origin https://github.com/your-username/line-connect.git
git push -u origin main
```

### 2. Railway プロジェクト作成

1. https://railway.app にログイン
2. "New Project" → "Deploy from GitHub repo"
3. このリポジトリを選択

### 3. PostgreSQL データベース追加

1. Railway プロジェクト内で "+ Add Service" → "Database" → "PostgreSQL"
2. `DATABASE_URL` が自動で環境変数に追加される

### 4. 環境変数設定

Railway の Variables タブで以下を設定:

```
GHL_APP_CLIENT_ID=69c23900ab906ecd709ba393-mn4a7udz
GHL_APP_CLIENT_SECRET=5dcec471-6a93-473c-a4b9-ebbd0fb9fadc
GHL_APP_REDIRECT_URI=https://YOUR-APP.up.railway.app/oauth/callback
ENCRYPTION_KEY=（node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" で生成）
APP_BASE_URL=https://YOUR-APP.up.railway.app
NODE_ENV=production
```

### 5. マイグレーション実行

Railway のコンソールで:
```bash
npm run migrate
```

### 6. GHL Developer Portal での設定

デプロイ後、GHL Developer Portal (https://marketplace.gohighlevel.com) で以下を設定:

**OAuth設定:**
- Redirect URI: `https://YOUR-APP.up.railway.app/oauth/callback`

**カスタムアクション (Send LINE Text):**
- Action Key: `send_line_text`
- Execution URL: `https://YOUR-APP.up.railway.app/actions/send-line-text`
- Fields:
  - `message` (Textarea) — LINEメッセージ本文（GHL変数使用可能）

**カスタムトリガー (LINE Friend Added):**
- Trigger Key: `line_friend_added`
- Subscription URL: `https://YOUR-APP.up.railway.app/triggers/subscribe`
- Data fields: userId, displayName, contactId, timestamp

**カスタムトリガー (LINE Message Received):**
- Trigger Key: `line_message_received`
- Subscription URL: `https://YOUR-APP.up.railway.app/triggers/subscribe`
- Data fields: userId, displayName, messageText, contactId, timestamp

---

## APIエンドポイント一覧

| メソッド | パス | 説明 |
|--------|------|------|
| GET | /health | ヘルスチェック |
| GET | /oauth/authorize | GHL OAuth開始 |
| GET | /oauth/callback | GHL OAuthコールバック |
| POST | /webhook/:locationId | LINE Webhookイベント受信 |
| POST | /actions/send-line-text | GHLワークフローアクション実行 |
| POST | /triggers/subscribe | GHLトリガーサブスクリプション管理 |
| GET | /settings | 設定画面HTML |
| GET | /api/settings/status | 接続ステータス取得 |
| POST | /api/settings/line-connect | LINE接続設定保存 |
| POST | /api/settings/line-test | LINE接続テスト |
| DELETE | /api/settings/line-connect | LINE接続解除 |
| GET | /api/settings/logs | メッセージログ取得 |

---

## データフロー

### LINE友だち追加 → GHLワークフロー起動

```
1. ユーザーがLINE公式アカウントを友だち追加
2. LINE → POST /webhook/{locationId}
3. LINE Profile API でdisplayName取得
4. GHL Contact作成 + line_uid保存 + "LINE友だち"タグ付与
5. DBに保存済みのtargetUrlへ POST（GHLワークフロー起動）
6. GHLワークフロー内の「LINE Friend Added」以降のステップが実行される
```

### GHLワークフロー → LINEメッセージ送信

```
1. GHLワークフローが「Send LINE Text」アクションに到達
2. GHL → POST /actions/send-line-text
3. DBからcontactId → line_uid を検索
4. DBからlocationId → LINE access_token を取得（復号化）
5. LINE Push Message API → ユーザーにメッセージ送信
6. GHLにレスポンス返却
```

---

## ディレクトリ構成

```
line-connect/
├── src/
│   ├── index.js                 # Expressサーバー
│   ├── config/
│   │   ├── database.js          # PostgreSQL接続
│   │   └── encryption.js        # AES-256-GCM暗号化
│   ├── routes/
│   │   ├── oauth.js             # GHL OAuth
│   │   ├── line-webhook.js      # LINE Webhook
│   │   ├── ghl-actions.js       # GHLワークフローアクション
│   │   ├── ghl-triggers.js      # GHLトリガーサブスクリプション
│   │   ├── settings.js          # 設定画面API
│   │   └── health.js            # ヘルスチェック
│   ├── services/
│   │   ├── line.js              # LINE API
│   │   ├── ghl.js               # GHL API v2
│   │   └── contact-mapper.js    # コンタクトマッピングロジック
│   ├── models/
│   │   ├── ghl-connection.js    # GHL OAuth tokens
│   │   ├── line-connection.js   # LINE credentials
│   │   ├── contact.js           # LINE contacts
│   │   ├── trigger-subscription.js # Trigger targetUrls
│   │   └── log.js               # Message logs
│   ├── middleware/
│   │   ├── line-signature.js    # LINE署名検証
│   │   └── ghl-auth.js          # GHL SSO/Webhook認証
│   └── scripts/
│       └── migrate.js           # DBマイグレーション
├── ui/
│   └── index.html               # 設定画面（Vue.js）
├── migrations/
│   └── 001_initial.sql          # DBスキーマ
├── .env                         # 環境変数（gitignore済み）
├── .env.example                 # 環境変数テンプレート
├── Dockerfile
├── railway.toml
└── package.json
```

---

## Phase 2 予定

- カスタムトリガー: LINE Postback (T3)
- カスタムアクション: Send LINE Image (A2), Send LINE Flex Message (A3)
- 既存コンタクトとの自動マッチング（メール/電話番号照合）
- メッセージリトライ + エラーハンドリング強化
