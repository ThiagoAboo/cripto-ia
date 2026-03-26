CREATE TABLE IF NOT EXISTS live_activation_requests (
  id BIGSERIAL PRIMARY KEY,
  target_mode TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  checklist_status TEXT NOT NULL,
  checklist_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  required_approvals INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  activated_by TEXT,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_activation_request_approvals (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES live_activation_requests(id) ON DELETE CASCADE,
  approved_by TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, approved_by)
);

CREATE TABLE IF NOT EXISTS live_mode_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  target_mode TEXT,
  requested_by TEXT NOT NULL,
  actor TEXT NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS testnet_supervision_reports (
  id BIGSERIAL PRIMARY KEY,
  trigger_source TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_activation_requests_status_created_at
  ON live_activation_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_mode_events_created_at
  ON live_mode_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_testnet_supervision_reports_created_at
  ON testnet_supervision_reports(created_at DESC);
