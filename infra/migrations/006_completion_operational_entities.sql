CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  external_reference varchar(160),
  phone varchar(40),
  email varchar(320),
  display_name varchar(200),
  status varchar(24) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','BLOCKED')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, external_reference)
);

CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  merchant_id uuid REFERENCES merchants(id),
  site_id uuid REFERENCES sites(id),
  code varchar(100) NOT NULL,
  device_type varchar(80) NOT NULL DEFAULT 'VENDING_MACHINE',
  serial_number varchar(160),
  status varchar(32) NOT NULL DEFAULT 'UNKNOWN' CHECK (status IN ('ONLINE','OFFLINE','DEGRADED','MAINTENANCE','UNKNOWN','RETIRED')),
  firmware_version varchar(120),
  network_status varchar(64),
  last_seen_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS device_provider_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  connector_id uuid REFERENCES provider_connectors(id) ON DELETE SET NULL,
  provider_device_id varchar(200) NOT NULL,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_id, provider_device_id),
  UNIQUE (device_id, provider_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  payment_reference varchar(200),
  provider_reference varchar(200),
  payment_method varchar(80),
  currency char(3) NOT NULL,
  amount numeric(20,6) NOT NULL CHECK (amount >= 0),
  fees numeric(20,6) NOT NULL DEFAULT 0 CHECK (fees >= 0),
  status varchar(32) NOT NULL CHECK (status IN ('CREATED','PENDING','SUCCESS','FAILED','CANCELLED','REVERSED','EXPIRED','UNKNOWN')),
  provider_status varchar(120),
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, payment_reference)
);

CREATE TABLE IF NOT EXISTS provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES provider_connectors(id) ON DELETE CASCADE,
  credential_type varchar(64) NOT NULL,
  credential_reference text NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRING','EXPIRED','REVOKED')),
  expires_at timestamptz,
  rotated_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, connector_id, credential_type)
);

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  alert_type varchar(100) NOT NULL,
  severity varchar(20) NOT NULL CHECK (severity IN ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  status varchar(24) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED','SUPPRESSED')),
  title varchar(240) NOT NULL,
  message text,
  provider_id uuid REFERENCES providers(id),
  connector_id uuid REFERENCES provider_connectors(id),
  transaction_id uuid REFERENCES transactions(id),
  source_key varchar(240),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_by uuid REFERENCES users(id),
  acknowledged_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS alerts_open_source_unique ON alerts(tenant_id,source_key) WHERE source_key IS NOT NULL AND status IN ('OPEN','ACKNOWLEDGED');
CREATE INDEX IF NOT EXISTS alerts_queue_idx ON alerts(tenant_id,status,severity,created_at DESC);

CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  incident_number varchar(64) NOT NULL,
  title varchar(240) NOT NULL,
  severity varchar(20) NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status varchar(32) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','INVESTIGATING','MITIGATED','RESOLVED','CLOSED')),
  provider_id uuid REFERENCES providers(id),
  connector_id uuid REFERENCES provider_connectors(id),
  owner_user_id uuid REFERENCES users(id),
  summary text,
  started_at timestamptz NOT NULL DEFAULT now(),
  mitigated_at timestamptz,
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, incident_number)
);

CREATE INDEX IF NOT EXISTS devices_status_idx ON devices(tenant_id,status,last_seen_at);
CREATE INDEX IF NOT EXISTS payments_transaction_idx ON payments(transaction_id,created_at DESC);
CREATE INDEX IF NOT EXISTS incidents_queue_idx ON incidents(tenant_id,status,severity,started_at DESC);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['customers','devices','device_provider_mappings','payments','provider_credentials','alerts','incidents'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_policy ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_tenant_policy ON %I USING (tenant_id=app.current_tenant_id() OR app.is_platform_admin()) WITH CHECK (tenant_id=app.current_tenant_id() OR app.is_platform_admin())', t, t);
  END LOOP;
END $$;

INSERT INTO permissions(code,description) VALUES
 ('merchant.read','View merchants and sites'),('merchant.manage','Manage merchants and sites'),
 ('catalog.read','View services and products'),('catalog.manage','Manage services and products'),
 ('route.manage','Manage routing rules'),('device.read','View devices'),('device.manage','Manage device mappings'),
 ('payment.read','View payment records'),('alert.read','View operational alerts'),('alert.manage','Acknowledge and resolve alerts'),
 ('incident.read','View incidents'),('incident.manage','Manage incidents'),('analytics.read','View analytics and reports'),
 ('admin.user.read','View users'),('admin.role.read','View roles and permissions'),('admin.audit.read','View immutable audit logs')
ON CONFLICT(code) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO capabilities(code,description,category) VALUES
 ('device.telemetry','Read device telemetry','device'),('device.command','Issue remote device command','device'),
 ('vend.cancel','Cancel a vend when provider contract proves it safe','vend')
ON CONFLICT(code) DO UPDATE SET description=EXCLUDED.description,category=EXCLUDED.category;
