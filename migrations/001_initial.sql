-- LINE Connect for GoHighLevel — Initial Database Migration
-- Run this against your PostgreSQL database to set up the schema

-- GHL OAuth tokens per location
CREATE TABLE IF NOT EXISTS ghl_connections (
  id                SERIAL PRIMARY KEY,
  ghl_location_id   VARCHAR(64) UNIQUE NOT NULL,
  ghl_company_id    VARCHAR(64),
  access_token      TEXT NOT NULL,
  refresh_token     TEXT NOT NULL,
  token_expires_at  TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- LINE API credentials per location (tokens stored encrypted)
CREATE TABLE IF NOT EXISTS line_connections (
  id                SERIAL PRIMARY KEY,
  ghl_location_id   VARCHAR(64) UNIQUE NOT NULL REFERENCES ghl_connections(ghl_location_id) ON DELETE CASCADE,
  line_channel_id   VARCHAR(32) NOT NULL,
  channel_secret    TEXT NOT NULL,   -- AES-256-GCM encrypted
  access_token      TEXT NOT NULL,   -- AES-256-GCM encrypted
  webhook_active    BOOLEAN DEFAULT false,
  friends_count     INTEGER DEFAULT 0,
  last_webhook_at   TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

-- GHL contacts linked to LINE UIDs
CREATE TABLE IF NOT EXISTS line_contacts (
  id                SERIAL PRIMARY KEY,
  ghl_location_id   VARCHAR(64) NOT NULL,
  ghl_contact_id    VARCHAR(64),
  line_uid          VARCHAR(64) NOT NULL,
  display_name      VARCHAR(256),
  picture_url       TEXT,
  is_blocked        BOOLEAN DEFAULT false,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW(),
  UNIQUE(ghl_location_id, line_uid)
);

CREATE INDEX IF NOT EXISTS idx_line_contacts_location_contact
  ON line_contacts(ghl_location_id, ghl_contact_id);

-- Trigger subscriptions: stores GHL-generated targetUrls per workflow trigger instance
CREATE TABLE IF NOT EXISTS trigger_subscriptions (
  id                SERIAL PRIMARY KEY,
  ghl_location_id   VARCHAR(64) NOT NULL,
  trigger_key       VARCHAR(64) NOT NULL,   -- e.g. 'line_friend_added'
  trigger_id        VARCHAR(128) NOT NULL,  -- unique per workflow trigger instance
  target_url        TEXT NOT NULL,          -- GHL-generated URL to POST events to
  workflow_id       VARCHAR(64),
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW(),
  UNIQUE(trigger_id)
);

CREATE INDEX IF NOT EXISTS idx_trigger_subscriptions_location_key
  ON trigger_subscriptions(ghl_location_id, trigger_key);

-- Message logs (inbound + outbound)
CREATE TABLE IF NOT EXISTS message_logs (
  id                SERIAL PRIMARY KEY,
  ghl_location_id   VARCHAR(64) NOT NULL,
  direction         VARCHAR(8) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  line_uid          VARCHAR(64),
  ghl_contact_id    VARCHAR(64),
  message_type      VARCHAR(16) NOT NULL,  -- 'text', 'image', 'flex', etc.
  content           TEXT,
  status            VARCHAR(16) NOT NULL,  -- 'sent', 'failed', 'received'
  error_detail      TEXT,
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_logs_location
  ON message_logs(ghl_location_id, created_at DESC);

-- Trigger for updated_at auto-update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_ghl_connections_updated_at ON ghl_connections;
CREATE TRIGGER update_ghl_connections_updated_at
  BEFORE UPDATE ON ghl_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_line_connections_updated_at ON line_connections;
CREATE TRIGGER update_line_connections_updated_at
  BEFORE UPDATE ON line_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_line_contacts_updated_at ON line_contacts;
CREATE TRIGGER update_line_contacts_updated_at
  BEFORE UPDATE ON line_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
