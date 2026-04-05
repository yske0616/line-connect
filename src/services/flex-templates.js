/**
 * flex-templates.js
 *
 * Preset Flex Message templates for LINE Connect actions.
 * Each template is a function that receives plain text fields and returns
 * a valid LINE Flex Message "contents" object (bubble type).
 *
 * Template types:
 *   booking_confirmation — 予約確認カード
 *   reminder             — リマインドカード
 *   testimonial          — お客様の声カード
 *   announcement         — お知らせカード
 */

const TEMPLATE_TYPES = {
  booking_confirmation: '予約確認カード',
  reminder: 'リマインドカード',
  testimonial: 'お客様の声カード',
  announcement: 'お知らせカード',
};

// ─── Shared helpers ─────────────────────────────────────────────────────────

function heroBlock(imageUrl) {
  if (!imageUrl) return null;
  return {
    type: 'image',
    url: imageUrl,
    size: 'full',
    aspectRatio: '20:13',
    aspectMode: 'cover',
  };
}

function buttonBlock(buttonText, buttonUrl, style = 'primary') {
  if (!buttonText || !buttonUrl) return null;
  return {
    type: 'button',
    style,
    height: 'sm',
    action: { type: 'uri', label: buttonText, uri: buttonUrl },
  };
}

function footerBlock(buttonText, buttonUrl, style = 'primary') {
  const btn = buttonBlock(buttonText, buttonUrl, style);
  if (!btn) return null;
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'sm',
    contents: [btn],
  };
}

// ─── 1. 予約確認カード ────────────────────────────────────────────────────────
// 緑アクセント。「ご予約が完了しました」系メッセージ向け。
function buildBookingConfirmation({ title, body, imageUrl, buttonText, buttonUrl }) {
  const bubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: '✅ 予約確定',
              size: 'xs',
              color: '#00B900',
              weight: 'bold',
              flex: 0,
            },
          ],
        },
        {
          type: 'text',
          text: title,
          weight: 'bold',
          size: 'lg',
          wrap: true,
          margin: 'md',
          color: '#1a1a1a',
        },
        {
          type: 'separator',
          margin: 'md',
          color: '#E8E8E8',
        },
        {
          type: 'text',
          text: body,
          size: 'sm',
          wrap: true,
          margin: 'md',
          color: '#555555',
          lineSpacing: '6px',
        },
      ],
    },
    styles: {
      body: { backgroundColor: '#FFFFFF' },
    },
  };

  const hero = heroBlock(imageUrl);
  if (hero) bubble.hero = hero;

  const footer = footerBlock(buttonText, buttonUrl, 'primary');
  if (footer) bubble.footer = footer;

  return bubble;
}

// ─── 2. リマインドカード ──────────────────────────────────────────────────────
// オレンジアクセント。イベント前日・当日リマインド向け。
function buildReminder({ title, body, imageUrl, buttonText, buttonUrl }) {
  const bubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: '🔔 リマインド',
              size: 'xs',
              color: '#FF8C00',
              weight: 'bold',
              flex: 0,
            },
          ],
        },
        {
          type: 'text',
          text: title,
          weight: 'bold',
          size: 'lg',
          wrap: true,
          margin: 'md',
          color: '#1a1a1a',
        },
        {
          type: 'separator',
          margin: 'md',
          color: '#E8E8E8',
        },
        {
          type: 'text',
          text: body,
          size: 'sm',
          wrap: true,
          margin: 'md',
          color: '#555555',
          lineSpacing: '6px',
        },
      ],
    },
    styles: {
      body: { backgroundColor: '#FFFDF7' },
    },
  };

  const hero = heroBlock(imageUrl);
  if (hero) bubble.hero = hero;

  const footer = footerBlock(buttonText, buttonUrl, 'secondary');
  if (footer) bubble.footer = footer;

  return bubble;
}

// ─── 3. お客様の声カード ──────────────────────────────────────────────────────
// 引用符スタイル。testimonial / 社会的証明の共有向け。
function buildTestimonial({ title, body, imageUrl, buttonText, buttonUrl }) {
  const bubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '⭐ お客様の声',
          size: 'xs',
          color: '#F5A623',
          weight: 'bold',
        },
        {
          type: 'text',
          text: title,
          weight: 'bold',
          size: 'md',
          wrap: true,
          margin: 'md',
          color: '#1a1a1a',
        },
        {
          type: 'separator',
          margin: 'md',
          color: '#E8E8E8',
        },
        {
          type: 'text',
          text: '❝',
          size: 'xxl',
          color: '#DDDDDD',
          margin: 'md',
        },
        {
          type: 'text',
          text: body,
          size: 'sm',
          wrap: true,
          color: '#444444',
          lineSpacing: '6px',
          margin: 'sm',
        },
      ],
    },
    styles: {
      body: { backgroundColor: '#FFFEF5' },
    },
  };

  const hero = heroBlock(imageUrl);
  if (hero) bubble.hero = hero;

  const footer = footerBlock(buttonText, buttonUrl, 'link');
  if (footer) bubble.footer = footer;

  return bubble;
}

// ─── 4. お知らせカード ────────────────────────────────────────────────────────
// 青アクセント。汎用インフォメーション・キャンペーン告知向け。
function buildAnnouncement({ title, body, imageUrl, buttonText, buttonUrl }) {
  const bubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '📢 お知らせ',
          size: 'xs',
          color: '#0070C0',
          weight: 'bold',
        },
        {
          type: 'text',
          text: title,
          weight: 'bold',
          size: 'lg',
          wrap: true,
          margin: 'md',
          color: '#1a1a1a',
        },
        {
          type: 'separator',
          margin: 'md',
          color: '#E8E8E8',
        },
        {
          type: 'text',
          text: body,
          size: 'sm',
          wrap: true,
          margin: 'md',
          color: '#555555',
          lineSpacing: '6px',
        },
      ],
    },
    styles: {
      body: { backgroundColor: '#F6FAFF' },
    },
  };

  const hero = heroBlock(imageUrl);
  if (hero) bubble.hero = hero;

  const footer = footerBlock(buttonText, buttonUrl, 'primary');
  if (footer) bubble.footer = footer;

  return bubble;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a Flex Message "contents" object from a preset template.
 *
 * @param {object} options
 * @param {'booking_confirmation'|'reminder'|'testimonial'|'announcement'} options.templateType
 * @param {string} options.title
 * @param {string} options.body
 * @param {string} [options.imageUrl]
 * @param {string} [options.buttonText]
 * @param {string} [options.buttonUrl]
 * @returns {object} LINE Flex Message contents (bubble)
 * @throws {Error} if templateType is invalid
 */
function buildFlexContents({ templateType, title, body, imageUrl, buttonText, buttonUrl }) {
  const params = { title, body, imageUrl, buttonText, buttonUrl };
  switch (templateType) {
    case 'booking_confirmation': return buildBookingConfirmation(params);
    case 'reminder':             return buildReminder(params);
    case 'testimonial':          return buildTestimonial(params);
    case 'announcement':         return buildAnnouncement(params);
    default:
      throw new Error(
        `テンプレートの種類が無効です: "${templateType}"。` +
        `booking_confirmation / reminder / testimonial / announcement のいずれかを指定してください。`
      );
  }
}

module.exports = { buildFlexContents, TEMPLATE_TYPES };
