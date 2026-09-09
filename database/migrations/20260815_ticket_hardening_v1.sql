-- Shared MAIN-BOT / WEB-PANEL ticket hardening migration.
-- Safe to run from either service because both record the same migration ID.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS close_state TEXT NOT NULL DEFAULT 'open';

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS close_started_at TIMESTAMPTZ;

ALTER TABLE ticket_transcripts
  ADD COLUMN IF NOT EXISTS attachment_message_id TEXT;

CREATE TABLE IF NOT EXISTS ticket_creation_guards (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_ticket_creation_guards_expires
  ON ticket_creation_guards(expires_at);

CREATE INDEX IF NOT EXISTS idx_tickets_close_state
  ON tickets(close_state, updated_at DESC);

UPDATE tickets
SET close_state = CASE
  WHEN status = 'closed' THEN 'closed'
  WHEN close_state IS NULL OR TRIM(close_state) = '' THEN 'open'
  ELSE close_state
END;
