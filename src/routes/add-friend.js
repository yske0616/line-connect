const express = require('express');
const router = express.Router();
const lineConnectionModel = require('../models/line-connection');
const lineService = require('../services/line');

/**
 * GET /add-friend/:locationId?ref={contactId}
 *
 * GHL ファネルのサンクスページリダイレクト先として使用。
 * GHL が {{contact.id}} を展開した URL でこのページを開く。
 *
 * 【スマートフォン】→ LINE アプリへ自動リダイレクト（ref 付き）
 * 【PC / タブレット】→ ref 入り QR コードを表示するページを返す
 *
 * 使い方:
 *   GHL ファネル サンクスページのリダイレクト URL に以下を設定:
 *   https://{your-domain}/add-friend/{locationId}?ref={{contact.id}}
 */
router.get('/:locationId', async (req, res) => {
  const { locationId } = req.params;
  const { ref } = req.query; // GHL の contact.id

  try {
    const lineConn = await lineConnectionModel.findByLocationId(locationId);
    if (!lineConn) {
      return res.status(404).send('<p>LINE が設定されていません。管理者にお問い合わせください。</p>');
    }

    // Bot 情報取得（表示名・アイコン・basicId）
    let botInfo;
    try {
      botInfo = await lineService.getBotInfo(lineConn.access_token);
    } catch (err) {
      console.error('[AddFriend] getBotInfo failed:', err.message);
      botInfo = { basicId: `@${lineConn.line_channel_id}`, displayName: 'LINE公式アカウント', pictureUrl: null };
    }

    const cleanId = (botInfo.basicId || '').startsWith('@')
      ? botInfo.basicId.slice(1)
      : botInfo.basicId;

    // ref パラメータ付きの友だち追加 URL
    const addFriendUrl = ref
      ? `https://line.me/R/ti/p/@${cleanId}?ref=${encodeURIComponent(ref)}`
      : `https://line.me/R/ti/p/@${cleanId}`;

    // User-Agent でモバイル判定 → スマホは即リダイレクト
    const ua = req.headers['user-agent'] || '';
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    if (isMobile) {
      console.log(`[AddFriend] Mobile redirect → ${addFriendUrl}`);
      return res.redirect(addFriendUrl);
    }

    // PC: QR コードページを返す
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(addFriendUrl)}`;
    const botName = botInfo.displayName || 'LINE公式アカウント';
    const botIcon = botInfo.pictureUrl || '';

    console.log(`[AddFriend] PC QR page served for location=${locationId}, ref=${ref || 'none'}`);

    return res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LINE 友だち追加</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Yu Gothic', sans-serif;
      background: #f0f4f8;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #fff;
      border-radius: 20px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.10);
      padding: 40px 36px 36px;
      max-width: 360px;
      width: 100%;
      text-align: center;
    }
    .bot-icon {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      object-fit: cover;
      margin-bottom: 12px;
      border: 2px solid #e8f5e9;
    }
    .bot-icon-placeholder {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: #06C755;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 12px;
      font-size: 32px;
    }
    .bot-name {
      font-size: 18px;
      font-weight: 700;
      color: #222;
      margin-bottom: 4px;
    }
    .subtitle {
      font-size: 13px;
      color: #888;
      margin-bottom: 24px;
    }
    .qr-wrap {
      background: #f9fafb;
      border-radius: 14px;
      padding: 16px;
      display: inline-block;
      margin-bottom: 20px;
    }
    .qr-wrap img {
      display: block;
      border-radius: 8px;
    }
    .instruction {
      font-size: 13px;
      color: #555;
      line-height: 1.7;
      margin-bottom: 24px;
    }
    .line-btn {
      display: inline-block;
      background: #06C755;
      color: #fff;
      text-decoration: none;
      font-size: 15px;
      font-weight: 700;
      padding: 14px 32px;
      border-radius: 50px;
      letter-spacing: 0.04em;
      transition: background 0.2s;
    }
    .line-btn:hover { background: #05b04c; }
    .line-btn-icon { font-size: 18px; margin-right: 6px; vertical-align: middle; }
    .note {
      font-size: 11px;
      color: #aaa;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="card">
    ${botIcon
      ? `<img class="bot-icon" src="${botIcon}" alt="${botName}">`
      : `<div class="bot-icon-placeholder">💬</div>`}
    <div class="bot-name">${botName}</div>
    <div class="subtitle">LINE 公式アカウント</div>

    <div class="qr-wrap">
      <img src="${qrApiUrl}" width="220" height="220" alt="友だち追加 QR コード">
    </div>

    <div class="instruction">
      スマートフォンの LINE アプリで<br>
      QR コードを読み取ってください
    </div>

    <a href="${addFriendUrl}" class="line-btn">
      <span class="line-btn-icon">＋</span>友だち追加
    </a>

    <div class="note">スマートフォンからアクセスした場合は自動でLINEが開きます</div>
  </div>
</body>
</html>`);
  } catch (err) {
    console.error('[AddFriend] Error:', err.message);
    res.status(500).send('<p>エラーが発生しました。しばらくしてからお試しください。</p>');
  }
});

module.exports = router;
