CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.is_platform_admin', true), '')::boolean, false)
$$;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(64) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  country char(2),
  default_currency char(3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  external_subject varchar(200),
  email varchar(320),
  display_name varchar(200),
  status varchar(32) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('INVITED','ACTIVE','SUSPENDED','DISABLED')),
  is_platform_admin boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_subject),
  UNIQUE (tenant_id, email)
);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  code varchar(100) NOT NULL,
  name varchar(150) NOT NULL,
  description text,
  system_defined boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, code)
);

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(128) NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code varchar(64) NOT NULL,
  name varchar(200) NOT NULL,
  legal_name varchar(250),
  status varchar(32) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('DRAFT','ACTIVE','SUSPENDED','CLOSED')),
  country char(2),
  currency char(3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  code varchar(64) NOT NULL,
  name varchar(200) NOT NULL,
  address text,
  district varchar(120),
  region varchar(120),
  latitude numeric(10,7),
  longitude numeric(10,7),
  timezone varchar(100) NOT NULL DEFAULT 'Africa/Kampala',
  status varchar(32) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','INACTIVE','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, code)
);

CREATE TABLE providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  code varchar(64) NOT NULL,
  name varchar(200) NOT NULL,
  legal_name varchar(250),
  provider_type varchar(40) NOT NULL
    CHECK (provider_type IN (
      'NATIVE','CPAY','DIRECT_API','UTILITY','AIRTIME',
      'VENDING_MACHINE','AGGREGATOR','CUSTOM'
    )),
  scope varchar(20) NOT NULL DEFAULT 'TENANT'
    CHECK (scope IN ('PLATFORM','TENANT')),
  status varchar(32) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN (
      'DRAFT','DEVELOPMENT','SANDBOX','CERTIFIED','PRODUCTION',
      'DEGRADED','SUSPENDED','MAINTENANCE','RETIRED'
    )),
  country char(2),
  supported_currencies text[] NOT NULL DEFAULT '{}',
  supported_regions text[] NOT NULL DEFAULT '{}',
  sla_tier varchar(50),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (scope = 'PLATFORM' AND tenant_id IS NULL)
    OR
    (scope = 'TENANT' AND tenant_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX providers_platform_code_unique
  ON providers(code)
  WHERE scope = 'PLATFORM';

CREATE UNIQUE INDEX providers_tenant_code_unique
  ON providers(tenant_id, code)
  WHERE scope = 'TENANT';

CREATE TABLE provider_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  environment varchar(32) NOT NULL
    CHECK (environment IN ('DEVELOPMENT','SANDBOX','STAGING','PRODUCTION')),
  api_version varchar(50),
  base_url text NOT NULL,
  auth_type varchar(32) NOT NULL
    CHECK (auth_type IN ('NONE','API_KEY','OAUTH2','BASIC','HMAC','MTLS','CUSTOM')),
  credential_reference text,
  webhook_secret_reference text,
  timeout_ms integer NOT NULL DEFAULT 30000 CHECK (timeout_ms BETWEEN 500 AND 120000),
  retry_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  health_check_path text,
  status varchar(32) NOT NULL DEFAULT 'DISABLED'
    CHECK (status IN ('ACTIVE','DISABLED','DEGRADED','OUTAGE','MAINTENANCE')),
  enabled boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, name, environment)
);

CREATE TABLE capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(128) NOT NULL UNIQUE,
  description text,
  category varchar(64),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE connector_capabilities (
  connector_id uuid NOT NULL REFERENCES provider_connectors(id) ON DELETE CASCADE,
  capability_id uuid NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  configured_by uuid REFERENCES users(id),
  configured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connector_id, capability_id)
);

CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  code varchar(80) NOT NULL,
  name varchar(200) NOT NULL,
  category varchar(80) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('DRAFT','ACTIVE','INACTIVE','RETIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, code)
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  service_id uuid NOT NULL REFERENCES services(id),
  internal_product_code varchar(100) NOT NULL,
  name varchar(200) NOT NULL,
  description text,
  currency char(3),
  min_amount numeric(20,6),
  max_amount numeric(20,6),
  fixed_price numeric(20,6),
  variable_amount_allowed boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, internal_product_code)
);

CREATE TABLE provider_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  provider_product_code varchar(200) NOT NULL,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, provider_product_code),
  UNIQUE (provider_id, product_id)
);

CREATE TABLE merchant_provider_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  provider_merchant_id varchar(200) NOT NULL,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, provider_id)
);

CREATE TABLE site_provider_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  provider_site_id varchar(200) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, provider_id)
);

CREATE TABLE routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  merchant_id uuid REFERENCES merchants(id),
  service_id uuid NOT NULL REFERENCES services(id),
  product_id uuid REFERENCES products(id),
  country char(2),
  region varchar(120),
  currency char(3),
  primary_provider_id uuid NOT NULL REFERENCES providers(id),
  secondary_provider_id uuid REFERENCES providers(id),
  priority integer NOT NULL DEFAULT 100,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK (secondary_provider_id IS NULL OR secondary_provider_id <> primary_provider_id)
);

CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_reference varchar(100) NOT NULL UNIQUE,
  correlation_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  merchant_id uuid NOT NULL REFERENCES merchants(id),
  provider_id uuid REFERENCES providers(id),
  connector_id uuid REFERENCES provider_connectors(id),
  service_id uuid NOT NULL REFERENCES services(id),
  product_id uuid REFERENCES products(id),
  site_id uuid REFERENCES sites(id),
  customer_id uuid,
  device_id uuid,
  currency char(3) NOT NULL,
  amount numeric(20,6) NOT NULL CHECK (amount >= 0),
  fees numeric(20,6) NOT NULL DEFAULT 0 CHECK (fees >= 0),
  taxes numeric(20,6) NOT NULL DEFAULT 0 CHECK (taxes >= 0),
  total_amount numeric(20,6) NOT NULL CHECK (total_amount >= 0),
  normalized_status varchar(32) NOT NULL DEFAULT 'CREATED'
    CHECK (normalized_status IN (
      'CREATED','PAYMENT_PENDING','PAID','SUBMITTED','ACCEPTED','FULFILLED',
      'SETTLED','FAILED','UNKNOWN','TIMED_OUT','CANCELLED','REVERSED',
      'REFUND_PENDING','REFUNDED','DISPUTED'
    )),
  provider_status varchar(120),
  provider_transaction_id varchar(200),
  cpay_transaction_id varchar(200),
  payment_reference varchar(200),
  idempotency_key varchar(200) NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX transactions_correlation_idx ON transactions(correlation_id);
CREATE INDEX transactions_provider_ref_idx
  ON transactions(provider_id, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;
CREATE INDEX transactions_tenant_created_idx ON transactions(tenant_id, created_at DESC);

CREATE TABLE transaction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  event_type varchar(120) NOT NULL,
  normalized_status varchar(32),
  provider_status varchar(120),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source varchar(80) NOT NULL,
  correlation_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transaction_events_tx_time_idx
  ON transaction_events(transaction_id, occurred_at);

CREATE TABLE approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  request_type varchar(100) NOT NULL,
  resource_type varchar(100) NOT NULL,
  resource_id uuid,
  status varchar(32) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  requested_by uuid NOT NULL REFERENCES users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  reason text,
  change_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  actor_user_id uuid REFERENCES users(id),
  action varchar(160) NOT NULL,
  resource_type varchar(100) NOT NULL,
  resource_id uuid,
  before_state jsonb,
  after_state jsonb,
  ip_address inet,
  user_agent text,
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_tenant_created_idx ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX audit_logs_resource_idx ON audit_logs(resource_type, resource_id);

CREATE OR REPLACE FUNCTION app.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END
$$;

CREATE TRIGGER audit_logs_no_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();

CREATE TRIGGER audit_logs_no_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION app.reject_audit_mutation();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_provider_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_provider_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_tenant_policy ON users
  USING (tenant_id = app.current_tenant_id() OR app.is_platform_admin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_platform_admin());

CREATE POLICY merchants_tenant_policy ON merchants
  USING (tenant_id = app.current_tenant_id() OR app.is_platform_admin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_platform_admin());

CREATE POLICY sites_tenant_policy ON sites
  USING (tenant_id = app.current_tenant_id() OR app.is_platform_admin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_platform_admin());

CREATE POLICY providers_select_policy ON providers
  FOR SELECT USING (
    scope = 'PLATFORM'
    OR tenant_id = app.current_tenant_id()
    OR app.is_platform_admin()
  );

CREATE POLICY providers_write_policy ON providers
  FOR ALL USING (
    tenant_id = app.current_tenant_id()
    OR app.is_platform_admin()
  )
  WITH CHECK (
    (scope = 'TENANT' AND tenant_id = app.current_tenant_id())
    OR app.is_platform_admin()
  );

CREATE POLICY provider_connectors_policy ON provider_connectors
  USING (
    EXISTS (
      SELECT 1
        FROM providers p
       WHERE p.id = provider_connectors.provider_id
         AND (
           p.scope = 'PLATFORM'
           OR p.tenant_id = app.current_tenant_id()
           OR app.is_platform_admin()
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM providers p
       WHERE p.id = provider_connectors.provider_id
         AND (
           p.tenant_id = app.current_tenant_id()
           OR app.is_platform_admin()
         )
    )
  );

CREATE POLICY connector_capabilities_policy ON connector_capabilities
  USING (
    EXISTS (
      SELECT 1
        FROM provider_connectors pc
        JOIN providers p ON p.id = pc.provider_id
       WHERE pc.id = connector_capabilities.connector_id
         AND (
           p.scope = 'PLATFORM'
           OR p.tenant_id = app.current_tenant_id()
           OR app.is_platform_admin()
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM provider_connectors pc
        JOIN providers p ON p.id = pc.provider_id
       WHERE pc.id = connector_capabilities.connector_id
         AND (
           p.tenant_id = app.current_tenant_id()
           OR app.is_platform_admin()
         )
    )
  );

CREATE POLICY services_policy ON services
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id() OR app.is_platform_admin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_platform_admin());

CREATE POLICY products_policy ON products
  USING (tenant_id IS NULL OR tenant_id = app.current_tenant_id() OR app.is_platform_admin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_platform_admin());

CREATE POLICY provider_products_policy ON provider_products
  USING (
    EXISTS (
      SELECT 1 FROM providers p
       WHERE p.id = provider_products.provider_id
         AND (p.scope = 'PLATFORM' OR p.tenant_id = app.current_tenant_id() OR app.is_platform_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM providers p
       WHERE p.id = provider_products.provider_id
         AND (p.tenant_id = app.current_tenant_id() OR app.is_platform_admin())
    )
  );

CREATE POLICY merchant_provider_mappings_policy ON merchant_provider_mappings
  USING (tenant_id = app.current_tenant_id() OR app.is_platform_admin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_platform_admin());

CREATE POLICY site_provider_mappings_policy ON site_provider_mappings
  USING (tenant_id = app.current_tenant_id() OR app.is_platform_admin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_platform_admin());

CREATE POLICY routes_policy ON routes
  USING (tenant_id = app.current_tenant_id() OR app.is_platform_admin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_platform_admin());

CREATE POLICY transactions_policy ON transactions
  USING (tenant_id = app.current_tenant_id() OR app.is_platform_admin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_platform_admin());

CREATE POLICY transaction_events_policy ON transaction_events
  USING (tenant_id = app.current_tenant_id() OR app.is_platform_admin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_platform_admin());

CREATE POLICY approval_requests_policy ON approval_requests
  USING (tenant_id = app.current_tenant_id() OR app.is_platform_admin())
  WITH CHECK (tenant_id = app.current_tenant_id() OR app.is_platform_admin());

CREATE POLICY audit_logs_policy ON audit_logs
  USING (
    tenant_id = app.current_tenant_id()
    OR app.is_platform_admin()
  )
  WITH CHECK (
    tenant_id = app.current_tenant_id()
    OR app.is_platform_admin()
  );
