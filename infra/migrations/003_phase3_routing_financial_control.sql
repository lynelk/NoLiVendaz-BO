ALTER TABLE transactions
  ADD COLUMN route_id uuid REFERENCES routes(id),
  ADD COLUMN transaction_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN provider_submission_at timestamptz,
  ADD COLUMN refund_required boolean NOT NULL DEFAULT false,
  ADD COLUMN settlement_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN financial_hold_reason text;

CREATE TABLE route_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  route_id uuid NOT NULL REFERENCES routes(id),
  selected_provider_id uuid NOT NULL REFERENCES providers(id),
  selected_connector_id uuid NOT NULL REFERENCES provider_connectors(id),
  selected_role varchar(20) NOT NULL CHECK (selected_role IN ('PRIMARY','SECONDARY')),
  reason text NOT NULL,
  health_status varchar(32) CHECK (health_status IS NULL OR health_status IN ('HEALTHY','DEGRADED','OUTAGE','MAINTENANCE','UNKNOWN')),
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  transaction_id uuid NOT NULL REFERENCES transactions(id),
  provider_id uuid NOT NULL REFERENCES providers(id),
  connector_id uuid NOT NULL REFERENCES provider_connectors(id),
  amount numeric(20,6) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL,
  reason text NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','APPROVED','PENDING','COMPLETED','FAILED','UNKNOWN','REJECTED','CANCELLED')),
  provider_refund_id varchar(200),
  provider_status varchar(120),
  idempotency_key varchar(200) NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (approved_by IS NULL OR approved_by <> requested_by),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE provider_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  provider_id uuid NOT NULL REFERENCES providers(id),
  connector_id uuid NOT NULL REFERENCES provider_connectors(id),
  provider_settlement_id varchar(200) NOT NULL,
  currency char(3) NOT NULL,
  gross_amount numeric(20,6) NOT NULL CHECK (gross_amount >= 0),
  net_amount numeric(20,6) NOT NULL CHECK (net_amount >= 0),
  provider_status varchar(120) NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end > period_start),
  UNIQUE (connector_id, provider_settlement_id)
);

CREATE TABLE reconciliation_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  transaction_id uuid REFERENCES transactions(id),
  provider_id uuid REFERENCES providers(id),
  exception_type varchar(80) NOT NULL,
  severity varchar(20) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  amount numeric(20,6) CHECK (amount IS NULL OR amount >= 0),
  currency char(3),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(24) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','INVESTIGATING','RESOLVED','IGNORED')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX reconciliation_open_unique ON reconciliation_exceptions(tenant_id,transaction_id,exception_type) WHERE status IN ('OPEN','INVESTIGATING');

CREATE INDEX route_decisions_transaction_idx ON route_decisions(transaction_id);
CREATE INDEX refunds_transaction_idx ON refunds(transaction_id,requested_at DESC);
CREATE INDEX settlements_provider_period_idx ON provider_settlements(provider_id,period_start,period_end);
CREATE INDEX reconciliation_open_idx ON reconciliation_exceptions(tenant_id,status,severity,detected_at DESC);

ALTER TABLE route_decisions ENABLE ROW LEVEL SECURITY; ALTER TABLE route_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY; ALTER TABLE refunds FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_settlements ENABLE ROW LEVEL SECURITY; ALTER TABLE provider_settlements FORCE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_exceptions ENABLE ROW LEVEL SECURITY; ALTER TABLE reconciliation_exceptions FORCE ROW LEVEL SECURITY;
CREATE POLICY route_decisions_tenant_policy ON route_decisions USING (tenant_id=app.current_tenant_id() OR app.is_platform_admin()) WITH CHECK (tenant_id=app.current_tenant_id() OR app.is_platform_admin());
CREATE POLICY refunds_tenant_policy ON refunds USING (tenant_id=app.current_tenant_id() OR app.is_platform_admin()) WITH CHECK (tenant_id=app.current_tenant_id() OR app.is_platform_admin());
CREATE POLICY provider_settlements_tenant_policy ON provider_settlements USING (tenant_id=app.current_tenant_id() OR app.is_platform_admin()) WITH CHECK (tenant_id=app.current_tenant_id() OR app.is_platform_admin());
CREATE POLICY reconciliation_tenant_policy ON reconciliation_exceptions USING (tenant_id=app.current_tenant_id() OR app.is_platform_admin()) WITH CHECK (tenant_id=app.current_tenant_id() OR app.is_platform_admin());

INSERT INTO permissions(code,description) VALUES
 ('transaction.initiate','Create and dispatch a routed vending transaction'),
 ('route.read','View routing decisions'),
 ('refund.request','Request a refund'),
 ('refund.approve','Approve and dispatch a refund'),
 ('refund.read','View refunds'),
 ('settlement.read','View normalized provider settlements'),
 ('settlement.sync','Fetch settlements from a provider'),
 ('reconciliation.read','View reconciliation exceptions'),
 ('reconciliation.run','Run reconciliation controls')
ON CONFLICT(code) DO UPDATE SET description=EXCLUDED.description;
