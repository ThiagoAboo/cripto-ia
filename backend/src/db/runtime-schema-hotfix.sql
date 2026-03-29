BEGIN;

CREATE TABLE IF NOT EXISTS live_mode_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  target_mode TEXT NOT NULL,
  requested_by TEXT NOT NULL DEFAULT 'system',
  actor TEXT,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_mode_events_created_at
  ON live_mode_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_mode_events_target_mode
  ON live_mode_events (target_mode, created_at DESC);

CREATE TABLE IF NOT EXISTS testnet_supervision_reports (
  id BIGSERIAL PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'ok',
  requested_by TEXT NOT NULL DEFAULT 'system',
  trigger_source TEXT NOT NULL DEFAULT 'scheduler',
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_testnet_supervision_reports_created_at
  ON testnet_supervision_reports (created_at DESC);

DO $$
DECLARE
  current_type TEXT;
BEGIN
  SELECT data_type
    INTO current_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'paper_positions'
    AND column_name = 'last_price';

  IF current_type IS NOT NULL AND current_type <> 'numeric' THEN
    EXECUTE 'ALTER TABLE paper_positions ALTER COLUMN last_price TYPE NUMERIC(28, 12) USING last_price::numeric';
  END IF;
END $$;

COMMIT;
