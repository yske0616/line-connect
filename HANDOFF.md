# LINE Connect for GoHighLevel — 引き継ぎドキュメント

> 最終更新: 2026-03-27 / Phase 1 MVP 完成・本番稼働中

---

## 📌 プロジェクト概要

GoHighLevel（GHL）の Marketplace App として、LINE Messaging API と連携するサーバー。
GHL のワークフローから LINE メッセージを送受信できるようにする SaaS アプリ。

- **GitHub**: https://github.com/yske0616/line-connect
- **本番サーバー**: https://line-connect-production.up.railway.app
- **ヘルスチェック**: https://line-connect-production.up.railway.app/health

---

## ✅ Phase 1 実装済み機能（動作確認済み）

| 機能 | 状態 | 備考 |
|------|------|------|
| GHL OAuth 2.0 認証フロー | ✅ 完成 | `/oauth/callback` |
| LINE Webhook 受信 | ✅ 完成 | `/webhook/:locationId` |
| コンタクト自動作成 | ✅ 完成 | LINE友だち追加・メッセージ受信時 |
| 「LINE友だち」タグ付与 | ✅ 完成 | 毎メッセージ時に再付与（削除後も復元） |
| LINE Message Received トリガー | ✅ Approved | GHL Workflow Builder で選択可能 |
| LINE Friend Added トリガー | ✅ Approved | GHL Workflow Builder で選択可能 |
| Send LINE Text アクション | ⏳ 審査中 | 動作確認済み・GHL審査待ち |
| PostgreSQL マルチテナント設計 | ✅ 完成 | Railway PostgreSQL |
| Railway デプロイ | ✅ 完成 | Docker + railway.toml |
| LINE 認証情報暗号化保存 | ✅ 完成 | AES-256-GCM |

---

## 🏗 アーキテクチャ

```
LINE Platform
    │ POST /webhook/:locationId
    ▼
Railway Server (Express.js / Node.js 20)
    │
    ├─ LINE署名検証（HMAC-SHA256）
    ├─ コンタクト作成 / タグ付与
    ├─ GHL API 呼び出し
    └─ GHL Workflow Trigger 発火
         │
         ▼
    GoHighLevel CRM
         │
         ▼ Workflow Action
    POST /actions/send-line-text
         │
         ▼
    LINE Platform（メッセージ送信）
```

**技術スタック:**
- **Runtime**: Node.js 20 / Express.js 4（TypeScript なし）
- **DB**: PostgreSQL（Railway managed）
- **暗号化**: AES-256-GCM（ENCRYPTION_KEY 環境変数）
- **LINE SDK**: @line/bot-sdk v9
- **設定UI**: Vue.js via CDN（ビルド不要）

---

## 📁 ディレクトリ構成

```
line-connect/
├── src/
│   ├── index.js                  # Expressサーバー エントリポイント
│   ├── config/
│   │   ├── database.js           # PostgreSQL接続プール（pg）
│   │   └── encryption.js         # AES-256-GCM 暗号化・復号
│   ├── middleware/
│   │   ├── ghl-auth.js           # GHL OAuthトークン検証
│   │   └── line-signature.js     # LINE Webhookシグネチャ検証
│   ├── models/
│   │   ├── ghl-connection.js     # GHL OAuthトークン CRUD
│   │   ├── line-connection.js    # LINE認証情報 CRUD（暗号化）
│   │   ├── contact.js            # line_contacts テーブル CRUD
│   │   ├── trigger-subscription.js # trigger_subscriptions CRUD
│   │   └── log.js                # message_logs CRUD
│   ├── routes/
│   │   ├── oauth.js              # GET /oauth/callback
│   │   ├── line-webhook.js       # POST /webhook/:locationId
│   │   ├── ghl-actions.js        # POST /actions/send-line-text
│   │   ├── ghl-triggers.js       # POST /triggers/subscribe
│   │   ├── settings.js           # GET /settings + GET /api/settings/status + POST /api/settings/line-connect
│   │   └── health.js             # GET /health
│   ├── services/
│   │   ├── ghl.js                # GHL API クライアント（コンタクト・タグ・トリガー）
│   │   ├── line.js               # LINE API クライアント（送信・プロフィール取得）
│   │   └── contact-mapper.js     # LINEイベント → GHL操作のメインロジック
│   └── scripts/
│       └── migrate.js            # DBマイグレーション実行スクリプト
├── migrations/
│   └── 001_initial.sql           # 初期スキーマ（5テーブル）
├── ui/
│   └── index.html                # 設定画面（Vue.js CDN）
├── Dockerfile                    # Node.js 20 Alpine
├── railway.toml                  # Railway設定（startCommand・healthcheck）
├── package.json
└── .env.example                  # 環境変数テンプレート
```

---

## 🗄 データベーススキーマ

```sql
-- GHL OAuth tokens（ロケーションごと）
ghl_connections
  id, ghl_location_id (UNIQUE), ghl_company_id,
  access_token, refresh_token, token_expires_at,
  created_at, updated_at

-- LINE 認証情報（AES-256-GCM 暗号化）
line_connections
  id, ghl_location_id (FK→ghl_connections),
  line_channel_id, channel_secret(encrypted), access_token(encrypted),
  webhook_active, friends_count, last_webhook_at,
  created_at, updated_at

-- LINE UID ↔ GHL ContactId マッピング
line_contacts
  id, ghl_location_id, ghl_contact_id, line_uid (UNIQUE per location),
  display_name, picture_url, is_blocked,
  created_at, updated_at

-- GHL Workflow Trigger サブスクリプション
trigger_subscriptions
  id, ghl_location_id, trigger_key, trigger_id (UNIQUE),
  target_url, workflow_id, is_active,
  created_at, updated_at

-- 送受信ログ
message_logs
  id, ghl_location_id, direction('inbound'|'outbound'),
  line_uid, ghl_contact_id, message_type, content,
  status('sent'|'failed'|'received'), error_detail,
  created_at
```

---

## 🔌 API エンドポイント

| Method | Path | 役割 |
|--------|------|------|
| GET | `/health` | ヘルスチェック（DB接続確認含む） |
| GET | `/oauth/callback` | GHL OAuth コード → トークン交換 |
| GET | `/settings` | 設定画面 HTML |
| GET | `/api/settings/status` | LINE・GHL 接続状態取得 |
| POST | `/api/settings/line-connect` | LINE 認証情報保存 |
| POST | `/webhook/:locationId` | LINE Webhook 受信 |
| POST | `/actions/send-line-text` | GHL Workflow Action（LINE送信） |
| POST | `/triggers/subscribe` | GHL Trigger サブスクリプション管理 |

---

## 🔑 環境変数

| 変数名 | 説明 | 設定場所 |
|--------|------|---------|
| `DATABASE_URL` | PostgreSQL接続URL | Railway（自動: `${{Postgres.DATABASE_URL}}`） |
| `GHL_APP_CLIENT_ID` | GHL App Client ID | Railway Variables |
| `GHL_APP_CLIENT_SECRET` | GHL App Client Secret | Railway Variables |
| `GHL_APP_REDIRECT_URI` | OAuth コールバックURL | Railway Variables |
| `ENCRYPTION_KEY` | 64文字hex（AES-256-GCM用） | Railway Variables |
| `APP_BASE_URL` | 本番サーバーURL | Railway Variables |
| `NODE_ENV` | `production` | Railway Variables |
| `PORT` | サーバーポート（デフォルト3000、Railwayは8080） | Railway 自動設定 |

---

## 🚀 デプロイ環境

| 項目 | 値 |
|------|---|
| プラットフォーム | Railway |
| サーバーURL | https://line-connect-production.up.railway.app |
| DB | Railway PostgreSQL（`${{Postgres.DATABASE_URL}}`で参照） |
| Dockerイメージ | node:20-alpine |
| ヘルスチェック | GET /health（起動10秒以内に200を返す） |
| マイグレーション | `npm run migrate`（Railway Shell で実行済み） |

---

## 📋 GHL Developer Portal 設定状況

| 項目 | 値 | 状態 |
|------|---|------|
| App Client ID | `69c23900ab906ecd709ba393-mn4a7udz` | ✅ |
| Redirect URI | `.../oauth/callback` | ✅ 登録済み |
| LINE Message Received Trigger | `.../triggers/subscribe` | ✅ **Approved** |
| LINE Friend Added Trigger | `.../triggers/subscribe` | ✅ **Approved** |
| Send LINE Text Action | `.../actions/send-line-text` | ⏳ 審査中（最大10営業日） |
| App Status | Draft | 公開には別途審査が必要 |

---

## 📱 LINE Developers 設定状況

| 項目 | 値 |
|------|---|
| Channel ID | `2009584594` |
| Webhook URL | `https://line-connect-production.up.railway.app/webhook/vU2oewMYLgWCjEv4UKfR` |
| Webhook Status | ✅ Verified / Active |

---

## 🔄 主要フロー詳細

### LINE → GHL（メッセージ受信）
```
1. LINE が POST /webhook/vU2oewMYLgWCjEv4UKfR
2. line-signature.js: DB から LINE接続情報を取得
3. line-signature.js: HMAC-SHA256 でシグネチャ検証
4. contact-mapper.js#handleMessage:
   - line_contacts テーブルで line_uid を検索
   - 未登録 → LINE Profile API → GHL createContact → line_contacts に保存
   - 登録済み → GHL addTags（LINE友だちタグを毎回付与）
5. message_logs にログ保存
6. trigger_subscriptions から有効なサブスクリプションを取得
7. 各 target_url に POST（GHL Workflow 発火）
```

### GHL → LINE（メッセージ送信）
```
1. GHL Workflow が POST /actions/send-line-text
   payload: { contactId, locationId, message }
2. ghl-actions.js:
   - locationId から LINE接続情報を取得（復号）
   - line_contacts から line_uid を取得
   - LINE API pushMessage で送信
3. message_logs に outbound ログ保存
```

### GHL Trigger サブスクリプション
```
GHL がワークフローを Publish すると:
  POST /triggers/subscribe { type: "CREATED", triggerKey, triggerId, targetUrl }
  → trigger_subscriptions に保存

GHL がワークフローを無効化すると:
  POST /triggers/subscribe { type: "DELETED", triggerId }
  → is_active = false に更新
```

---

## 🐛 修正済みバグ一覧

| コミット | 問題 | 修正内容 |
|---------|------|---------|
| `0ed75f4` | `/webhook` で `stream is not readable` エラー | express.json を webhook パスでスキップ |
| `9be8a49` | マイグレーション2回目実行でエラー | `CREATE OR REPLACE` + `DROP TRIGGER IF EXISTS` で冪等化 |
| `e8cd8b9` | LINE Webhook Verify が 404 | LINE未設定時も 200 を返すよう変更 |
| `385e6da` | `/settings` が 404 | settingsRouter を登録 |
| `6dc35d2` | 2回目以降のメッセージでタグ付与されない | 既存コンタクトにも毎回 addTags を呼び出す |

---

## 🔮 Phase 2 以降の開発候補

| 優先度 | 機能 | 概要 |
|--------|------|------|
| 高 | Send LINE Text Action 審査通過待ち | 現在審査中（10営業日） |
| 高 | GHL App 公開申請 | Mandatory Steps 5/5 を完了して Submit for Review |
| 中 | 画像・スタンプ受信 | LINE の非テストメッセージ対応 |
| 中 | リッチメニュー設定UI | LINE リッチメニューを設定画面から管理 |
| 中 | メッセージ履歴画面 | 送受信ログの閲覧・検索UI |
| 低 | Flex Message 送信 | カード型リッチメッセージ（GHL Action 追加） |
| 低 | LINE 一括ブロードキャスト | GHL セグメントへの一斉送信 |
| 低 | 複数ロケーション管理画面 | インストール済みロケーション一覧 |

---

## 💻 ローカル開発手順

```bash
# 1. リポジトリをクローン
git clone https://github.com/yske0616/line-connect.git
cd line-connect

# 2. 依存関係インストール
npm install

# 3. 環境変数設定
cp .env.example .env
# .env を編集（DATABASE_URL, ENCRYPTION_KEY 等）

# 4. DBマイグレーション
npm run migrate

# 5. 開発サーバー起動
npm run dev  # nodemon で自動リロード
```

---

## 📞 外部サービスアカウント情報

| サービス | アカウント | 備考 |
|---------|-----------|------|
| GitHub | yske0616 | リポジトリオーナー |
| Railway | - | line-connect プロジェクト |
| GHL Marketplace | - | App ID: 69c23900ab906ecd709ba393 |
| LINE Developers | - | Channel ID: 2009584594 |
