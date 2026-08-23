ALTER TABLE provider_connectors
  ADD COLUMN runtime_configuration jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE transactions
  ADD COLUMN payment_status varchar(32) NOT NULL DEFAULT 'CREATED'
    CHECK (payment_status IN ('CREATED','PENDING','SUCCESS','FAILED','CANCELLED','REVERSED','EXPIRED','UNKNOWN')),
  ADD COLUMN vend_status varchar(32) NOT NULL DEFAULT 'CREATED'
    CHECK (vend_status IN ('CREATED','SUBMITTED','ACCEPTED','FULFILLED','FAILED','UNKNOWN','CANCELLED')),
  ADD COLUMN refund_status varchar(32),
  ADD COLUMN settlement_status varchar(32),
  ADD COLUMN unknown_since timestamptz,
  ADD COLUMN last_provider_query_at timestamptz;

CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES provider_connectors(id) ON DELETE CASCADE,
  external_event_id varchar(240),
  event_type varchar(160),
  payload_hash char(64) NOT NULL,
  signature_valid boolean NOT NULL DEFAULT false,
  processing_status varchar(32) NOT NULL DEFAULT 'RECEIVED'
    CHECK (processing_status IN ('RECEIVED','PROCESSED','DUPLICATE','REJECTED','FAILED')),
  raw_payload jsonb NOT NULL,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE UNIQUE INDEX webhook_events_external_id_unique
  ON webhook_events(connector_id, external_event_id)
  WHERE external_event_id IS NOT NULL;
CREATE INDEX webhook_events_hash_idx ON webhook_events(connector_id, payload_hash);
CREATE INDEX webhook_events_received_idx ON webhook_events(received_at DESC);

CREATE TABLE provider_health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES provider_connectors(id) ON DELETE CASCADE,
  health_status varchar(32) NOT NULL
    CHECK (health_status IN ('HEALTHY','DEGRADED','OUTAGE','MAINTENANCE','UNKNOWN')),
  latency_ms integer,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provider_health_connector_time_idx
  ON provider_health_events(connector_id, checked_at DESC);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_health_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_health_events FORCE ROW LEVEL SECURITY;

CREATE POLICY webhook_events_tenant_policy ON webhook_events
  USING (app.is_platform_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_platform_admin() OR tenant_id = app.current_tenant_id());

CREATE POLICY provider_health_tenant_policy ON provider_health_events
  USING (app.is_platform_admin() OR tenant_id = app.current_tenant_id())
  WITH CHECK (app.is_platform_admin() OR tenant_id = app.current_tenant_id());

INSERT INTO permissions (code, description) VALUES
  ('transaction.read','View canonical transactions and timelines'),
  ('transaction.query_provider','Query the original provider for current transaction state'),
  ('provider.health.read','View provider and connector health'),
  ('provider.health.check','Run an on-demand provider health check')
ON CONFLICT (code) DO NOTHING;
