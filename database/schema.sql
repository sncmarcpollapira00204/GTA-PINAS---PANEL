CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL DEFAULT 'Unknown User',
  avatar TEXT,
  is_bot BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL DEFAULT 'Unknown Staff',
  role TEXT DEFAULT 'Ticket Handler',
  avatar TEXT,
  tickets_claimed INTEGER DEFAULT 0,
  tickets_assigned INTEGER DEFAULT 0,
  tickets_closed INTEGER DEFAULT 0,
  tickets_handled INTEGER DEFAULT 0,
  whitelist_approved INTEGER DEFAULT 0,
  admin_actions INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  ticket_id TEXT,
  ticket_number TEXT,
  guild_id TEXT,
  channel_id TEXT,
  channel_name TEXT,
  user_id TEXT,
  category TEXT,
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'open',
  details TEXT,
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  assigned_to TEXT,
  assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  close_reason TEXT,
  transcript_message_id TEXT,
  transcript_channel_id TEXT,
  transcript_url TEXT,
  import_source TEXT DEFAULT 'live',
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT,
  user_id TEXT,
  username TEXT,
  avatar TEXT,
  content TEXT,
  is_embed BOOLEAN DEFAULT FALSE,
  is_bot BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_transcripts (
  id TEXT PRIMARY KEY,
  ticket_id TEXT,
  html_content TEXT,
  discord_url TEXT,
  log_channel_id TEXT,
  log_message_id TEXT,
  generated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT,
  ticket_id TEXT,
  filename TEXT,
  url TEXT,
  content_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_logs (
  id BIGSERIAL PRIMARY KEY,
  ticket_id TEXT,
  action TEXT NOT NULL,
  actor_id TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START WITH 1000 INCREMENT BY 1;

-- Add every column needed by the Web Panel to older databases.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT DEFAULT 'Unknown User';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE staff ADD COLUMN IF NOT EXISTS username TEXT DEFAULT 'Unknown Staff';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Ticket Handler';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS tickets_claimed INTEGER DEFAULT 0;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS tickets_assigned INTEGER DEFAULT 0;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS tickets_closed INTEGER DEFAULT 0;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS tickets_handled INTEGER DEFAULT 0;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS whitelist_approved INTEGER DEFAULT 0;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS admin_actions INTEGER DEFAULT 0;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_id TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_number TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS guild_id TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS channel_id TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS channel_name TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS claimed_by TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS closed_by TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS close_reason TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS transcript_message_id TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS transcript_channel_id TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS transcript_url TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS import_source TEXT DEFAULT 'live';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS ticket_id TEXT;
ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS is_embed BOOLEAN DEFAULT FALSE;
ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE;
ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE ticket_messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE ticket_transcripts ADD COLUMN IF NOT EXISTS ticket_id TEXT;
ALTER TABLE ticket_transcripts ADD COLUMN IF NOT EXISTS html_content TEXT;
ALTER TABLE ticket_transcripts ADD COLUMN IF NOT EXISTS discord_url TEXT;
ALTER TABLE ticket_transcripts ADD COLUMN IF NOT EXISTS log_channel_id TEXT;
ALTER TABLE ticket_transcripts ADD COLUMN IF NOT EXISTS log_message_id TEXT;
ALTER TABLE ticket_transcripts ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE attachments ADD COLUMN IF NOT EXISTS message_id TEXT;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS ticket_id TEXT;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS filename TEXT;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS content_type TEXT;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS size_bytes BIGINT;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE ticket_logs ADD COLUMN IF NOT EXISTS ticket_id TEXT;
ALTER TABLE ticket_logs ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE ticket_logs ADD COLUMN IF NOT EXISTS actor_id TEXT;
ALTER TABLE ticket_logs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE ticket_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE ticket_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Remove old foreign keys before converting old INTEGER IDs to TEXT Discord IDs.
DO $$
DECLARE
  row_data RECORD;
BEGIN
  FOR row_data IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE contype = 'f'
      AND conrelid IN (
        'tickets'::regclass,
        'ticket_messages'::regclass,
        'ticket_transcripts'::regclass,
        'attachments'::regclass
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I',
      row_data.table_name,
      row_data.conname
    );
  END LOOP;
END
$$;

-- Convert all Discord identifier columns to TEXT without deleting rows.
ALTER TABLE users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE users ALTER COLUMN id TYPE TEXT USING id::TEXT;

ALTER TABLE staff ALTER COLUMN id DROP DEFAULT;
ALTER TABLE staff ALTER COLUMN id TYPE TEXT USING id::TEXT;

ALTER TABLE tickets ALTER COLUMN id DROP DEFAULT;
ALTER TABLE tickets ALTER COLUMN id TYPE TEXT USING id::TEXT;
ALTER TABLE tickets ALTER COLUMN ticket_id TYPE TEXT USING ticket_id::TEXT;
ALTER TABLE tickets ALTER COLUMN ticket_number TYPE TEXT USING ticket_number::TEXT;
ALTER TABLE tickets ALTER COLUMN guild_id TYPE TEXT USING guild_id::TEXT;
ALTER TABLE tickets ALTER COLUMN channel_id TYPE TEXT USING channel_id::TEXT;
ALTER TABLE tickets ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
ALTER TABLE tickets ALTER COLUMN claimed_by TYPE TEXT USING claimed_by::TEXT;
ALTER TABLE tickets ALTER COLUMN assigned_to TYPE TEXT USING assigned_to::TEXT;
ALTER TABLE tickets ALTER COLUMN closed_by TYPE TEXT USING closed_by::TEXT;

ALTER TABLE ticket_messages ALTER COLUMN id DROP DEFAULT;
ALTER TABLE ticket_messages ALTER COLUMN id TYPE TEXT USING id::TEXT;
ALTER TABLE ticket_messages ALTER COLUMN ticket_id TYPE TEXT USING ticket_id::TEXT;
ALTER TABLE ticket_messages ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

ALTER TABLE ticket_transcripts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE ticket_transcripts ALTER COLUMN id TYPE TEXT USING id::TEXT;
ALTER TABLE ticket_transcripts ALTER COLUMN ticket_id TYPE TEXT USING ticket_id::TEXT;

ALTER TABLE attachments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE attachments ALTER COLUMN id TYPE TEXT USING id::TEXT;
ALTER TABLE attachments ALTER COLUMN message_id TYPE TEXT USING message_id::TEXT;
ALTER TABLE attachments ALTER COLUMN ticket_id TYPE TEXT USING ticket_id::TEXT;

UPDATE tickets
SET
  status = COALESCE(status, 'open'),
  priority = COALESCE(priority, 'normal'),
  last_activity_at = COALESCE(last_activity_at, created_at, CURRENT_TIMESTAMP),
  updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
WHERE
  status IS NULL
  OR priority IS NULL
  OR last_activity_at IS NULL
  OR updated_at IS NULL;

-- Recreate only safe parent/child relations. Staff/user links remain flexible for imports.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ticket_messages_ticket_id_fkey'
      AND conrelid = 'ticket_messages'::regclass
  ) THEN
    ALTER TABLE ticket_messages
      ADD CONSTRAINT ticket_messages_ticket_id_fkey
      FOREIGN KEY (ticket_id)
      REFERENCES tickets(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ticket_transcripts_ticket_id_fkey'
      AND conrelid = 'ticket_transcripts'::regclass
  ) THEN
    ALTER TABLE ticket_transcripts
      ADD CONSTRAINT ticket_transcripts_ticket_id_fkey
      FOREIGN KEY (ticket_id)
      REFERENCES tickets(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attachments_message_id_fkey'
      AND conrelid = 'attachments'::regclass
  ) THEN
    ALTER TABLE attachments
      ADD CONSTRAINT attachments_message_id_fkey
      FOREIGN KEY (message_id)
      REFERENCES ticket_messages(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attachments_ticket_id_fkey'
      AND conrelid = 'attachments'::regclass
  ) THEN
    ALTER TABLE attachments
      ADD CONSTRAINT attachments_ticket_id_fkey
      FOREIGN KEY (ticket_id)
      REFERENCES tickets(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_tickets_status_created
  ON tickets(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_channel_id
  ON tickets(channel_id);

CREATE INDEX IF NOT EXISTS idx_tickets_user_id
  ON tickets(user_id);

CREATE INDEX IF NOT EXISTS idx_tickets_claimed_by
  ON tickets(claimed_by);

CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to
  ON tickets(assigned_to);

CREATE INDEX IF NOT EXISTS idx_tickets_closed_by
  ON tickets(closed_by);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created
  ON ticket_messages(ticket_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_ticket_transcripts_ticket
  ON ticket_transcripts(ticket_id);

CREATE INDEX IF NOT EXISTS idx_ticket_logs_ticket_created
  ON ticket_logs(ticket_id, created_at DESC);
