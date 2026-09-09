CREATE TABLE IF NOT EXISTS runtime_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  stage TEXT NOT NULL DEFAULT 'Queued',
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  processed BIGINT NOT NULL DEFAULT 0,
  total BIGINT NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT 'Waiting to start.',
  details JSONB NOT NULL DEFAULT '[]'::jsonb,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_runtime_jobs_status_updated
  ON runtime_jobs(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_runtime_jobs_updated
  ON runtime_jobs(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_status_updated
  ON tickets(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_transcripts_ticket_generated
  ON ticket_transcripts(ticket_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_attachments_ticket_created
  ON attachments(ticket_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_attachments_message_created
  ON attachments(message_id, created_at ASC);
