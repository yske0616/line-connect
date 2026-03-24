require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Raw body capture (required for LINE Webhook signature verification) ─────
// Must come before express.json() for the webhook route
app.use('/webhook', (req, res, next) => {
  let rawBody = Buffer.alloc(0);
  req.on('data', (chunk) => {
    rawBody = Buffer.concat([rawBody, chunk]);
  });
  req.on('end', () => {
    req.rawBody = rawBody;
    // Also parse JSON body from the raw body
    try {
      req.body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      req.body = {};
    }
    next();
  });
});

// ─── Standard middleware ───────────────────────────────────────────────────
app.use(cors({
  origin: [
    'https://app.gohighlevel.com',
    'https://beta.gohighlevel.com',
    'https://marketplace.gohighlevel.com',
    process.env.APP_BASE_URL,
  ].filter(Boolean),
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Static files (settings UI) ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'ui')));

// ─── Routes ───────────────────────────────────────────────────────────────
const healthRouter = require('./routes/health');
const oauthRouter = require('./routes/oauth');
const webhookRouter = require('./routes/line-webhook');
const actionsRouter = require('./routes/ghl-actions');
const triggersRouter = require('./routes/ghl-triggers');
const settingsRouter = require('./routes/settings');

app.use('/health', healthRouter);
app.use('/oauth', oauthRouter);
app.use('/webhook', webhookRouter);
app.use('/actions', actionsRouter);
app.use('/triggers', triggersRouter);
app.use('/', settingsRouter);

// ─── 404 handler ──────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// ─── Error handler ────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start server ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ┌─────────────────────────────────────────┐
  │  🟢 LINE Connect for GoHighLevel        │
  │     Server running on port ${PORT}          │
  │                                         │
  │  Health:   http://localhost:${PORT}/health  │
  │  OAuth:    http://localhost:${PORT}/oauth   │
  │  Settings: http://localhost:${PORT}/settings│
  └─────────────────────────────────────────┘
  `);
});

module.exports = app;
