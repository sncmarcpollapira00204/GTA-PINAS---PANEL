CREATE INDEX IF NOT EXISTS idx_tickets_closed_final_handler
  ON tickets (
    (
      COALESCE(
        NULLIF(BTRIM(assigned_to), ''),
        NULLIF(BTRIM(claimed_by), ''),
        NULLIF(BTRIM(closed_by), '')
      )
    ),
    id
  )
  WHERE status = 'closed';
