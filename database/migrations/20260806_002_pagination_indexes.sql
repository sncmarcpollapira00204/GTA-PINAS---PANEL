CREATE INDEX IF NOT EXISTS idx_tickets_open_source_updated
  ON tickets(status, import_source, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_closed_transcript_updated
  ON tickets(status, transcript_channel_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_category_updated
  ON tickets(category, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created_id
  ON ticket_messages(ticket_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_ticket_logs_ticket_created_id
  ON ticket_logs(ticket_id, created_at ASC, id ASC);
