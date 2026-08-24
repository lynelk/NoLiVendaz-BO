ALTER TABLE transactions
  ADD COLUMN recovery_lease_until timestamptz,
  ADD COLUMN recovery_attempts integer NOT NULL DEFAULT 0 CHECK (recovery_attempts >= 0),
  ADD COLUMN next_recovery_at timestamptz,
  ADD COLUMN recovery_last_error text;

ALTER TABLE refunds
  ADD COLUMN recovery_lease_until timestamptz,
  ADD COLUMN recovery_attempts integer NOT NULL DEFAULT 0 CHECK (recovery_attempts >= 0),
  ADD COLUMN next_recovery_at timestamptz,
  ADD COLUMN recovery_last_error text;

CREATE TABLE support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  case_number varchar(64) NOT NULL,
  source varchar(32) NOT NULL DEFAULT 'MANUAL'
    CHECK (source IN ('MANUAL','RECOVERY','RECONCILIATION','SYSTEM')),
  source_key varchar(240),
  category varchar(48) NOT NULL
    CHECK (category IN ('TRANSACTION_UNKNOWN','REFUND','SETTLEMENT','PROVIDER','CUSTOMER','OTHER')),
  priority varchar(20) NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status varchar(32) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','INVESTIGATING','PENDING_PROVIDER','PENDING_CUSTOMER','RESOLVED','CLOSED')),
  title varchar(240) NOT NULL,
  description text,
  transaction_id uuid REFERENCES transactions(id),
  provider_id uuid REFERENCES providers(id),
  connector_id uuid REFERENCES provider_connectors(id),
  refund_id uuid REFERENCES refunds(id),
  reconciliation_exception_id uuid REFERENCES reconciliation_exceptions(id),
  assigned_to uuid REFERENCES users(id),
  opened_by uuid REFERENCES users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, case_number)
);
CREATE UNIQUE INDEX support_cases_source_key_unique
  ON support_cases(tenant_id, source_key)
  WHERE source_key IS NOT NULL;
CREATE INDEX support_cases_queue_idx
  ON support_cases(tenant_id,status,priority,opened_at DESC);
CREATE INDEX support_cases_transaction_idx ON support_cases(transaction_id);

CREATE TABLE support_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  support_case_id uuid NOT NULL REFERENCES support_cases(id) ON DELETE CASCADE,
  event_type varchar(64) NOT NULL,
  from_status varchar(32),
  to_status varchar(32),
  note text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_case_events_case_time_idx
  ON support_case_events(support_case_id,created_at);

CREATE TABLE provider_certification_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES provider_connectors(id) ON DELETE CASCADE,
  environment varchar(32) NOT NULL
    CHECK (environment IN ('DEVELOPMENT','SANDBOX','STAGING','PRODUCTION')),
  status varchar(24) NOT NULL DEFAULT 'RUNNING'
    CHECK (status IN ('RUNNING','PASSED','FAILED','CERTIFIED','CANCELLED')),
  requested_by uuid NOT NULL REFERENCES users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (approved_by IS NULL OR approved_by <> requested_by)
);
CREATE INDEX provider_certification_runs_connector_idx
  ON provider_certification_runs(connector_id,requested_at DESC);

CREATE TABLE provider_certification_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  run_id uuid NOT NULL REFERENCES provider_certification_runs(id) ON DELETE CASCADE,
  check_code varchar(100) NOT NULL,
  severity varchar(20) NOT NULL DEFAULT 'REQUIRED'
    CHECK (severity IN ('REQUIRED','ADVISORY')),
  result varchar(16) NOT NULL
    CHECK (result IN ('PASS','FAIL','SKIP')),
  message text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, check_code)
);

CREATE TABLE settlement_transaction_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  settlement_id uuid NOT NULL REFERENCES provider_settlements(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  match_source varchar(32) NOT NULL DEFAULT 'PROVIDER_REFERENCE'
    CHECK (match_source IN ('PROVIDER_REFERENCE','MANUAL')),
  matched_amount numeric(20,6) NOT NULL CHECK (matched_amount >= 0),
  matched_by uuid REFERENCES users(id),
  matched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (settlement_id, transaction_id)
);
CREATE INDEX settlement_transaction_links_transaction_idx
  ON settlement_transaction_links(transaction_id);

CREATE INDEX transactions_recovery_queue_idx
  ON transactions(tenant_id,next_recovery_at,recovery_lease_until)
  WHERE normalized_status IN ('UNKNOWN','TIMED_OUT');
CREATE INDEX refunds_recovery_queue_idx
  ON refunds(tenant_id,next_recovery_at,recovery_lease_until)
  WHERE status IN ('PENDING','UNKNOWN');

ALTER TABLE support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE support_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_case_events FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_certification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_certification_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_certification_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_certification_checks FORCE ROW LEVEL SECURITY;
ALTER TABLE settlement_transaction_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_transaction_links FORCE ROW LEVEL SECURITY;

CREATE POLICY support_cases_tenant_policy ON support_cases
  USING (tenant_id=app.current_tenant_id() OR app.is_platform_admin())
  WITH CHECK (tenant_id=app.current_tenant_id() OR app.is_platform_admin());
CREATE POLICY support_case_events_tenant_policy ON support_case_events
  USING (tenant_id=app.current_tenant_id() OR app.is_platform_admin())
  WITH CHECK (tenant_id=app.current_tenant_id() OR app.is_platform_admin());
CREATE POLICY provider_certification_runs_tenant_policy ON provider_certification_runs
  USING (tenant_id=app.current_tenant_id() OR app.is_platform_admin())
  WITH CHECK (tenant_id=app.current_tenant_id() OR app.is_platform_admin());
CREATE POLICY provider_certification_checks_tenant_policy ON provider_certification_checks
  USING (tenant_id=app.current_tenant_id() OR app.is_platform_admin())
  WITH CHECK (tenant_id=app.current_tenant_id() OR app.is_platform_admin());
CREATE POLICY settlement_transaction_links_tenant_policy ON settlement_transaction_links
  USING (tenant_id=app.current_tenant_id() OR app.is_platform_admin())
  WITH CHECK (tenant_id=app.current_tenant_id() OR app.is_platform_admin());

INSERT INTO permissions(code,description) VALUES
 ('recovery.read','View automated recovery queues and outcomes'),
 ('recovery.run','Run a tenant recovery cycle'),
 ('support.read','View support cases'),
 ('support.create','Open support cases'),
 ('support.update','Update support cases and add case events'),
 ('certification.read','View provider certification runs'),
 ('certification.run','Execute connector certification checks'),
 ('certification.approve','Approve a passed certification and promote provider lifecycle'),
 ('provider.lifecycle.manage','Move providers through pre-production lifecycle stages'),
 ('provider.connector.state.manage','Manage non-production connector operational state'),
 ('settlement.match','Match settlement records to transactions')
ON CONFLICT(code) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO capabilities(code,description,category) VALUES
 ('refund.status','Query refund status','refund')
ON CONFLICT(code) DO UPDATE SET description=EXCLUDED.description, category=EXCLUDED.category;
