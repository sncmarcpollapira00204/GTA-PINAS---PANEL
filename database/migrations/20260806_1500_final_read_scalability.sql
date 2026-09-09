-- Final read-path indexes for the current panel and the paginated APIs.
-- All statements are additive and preserve existing rows and UI behavior.

CREATE INDEX IF NOT EXISTS idx_tickets_panel_open_activity
  ON tickets (
    COALESCE(updated_at, last_activity_at, created_at) DESC,
    id DESC
  )
  WHERE status = 'open'
    AND COALESCE(import_source, 'live') IN ('live', 'discord_open_import');

CREATE INDEX IF NOT EXISTS idx_tickets_panel_closed_transcript_activity
  ON tickets (
    transcript_channel_id,
    COALESCE(updated_at, last_activity_at, closed_at, created_at) DESC,
    id DESC
  )
  WHERE status = 'closed'
    AND transcript_channel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_closed_final_handler
  ON tickets (
    COALESCE(
      NULLIF(TRIM(assigned_to), ''),
      NULLIF(TRIM(claimed_by), ''),
      NULLIF(TRIM(closed_by), '')
    )
  )
  WHERE status = 'closed';

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created_id
  ON ticket_messages (ticket_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_ticket_logs_ticket_created_id
  ON ticket_logs (ticket_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_attachments_message_created
  ON attachments (message_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_ticket_transcripts_ticket_generated
  ON ticket_transcripts (ticket_id, generated_at DESC);
