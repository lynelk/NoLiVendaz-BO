-- Align Back Office customer assurance with NOLI's protected-service policy and CPay's
-- provider-declared identity capabilities. This migration stores only policy booleans, masked
-- identity state and provider coverage. Raw identity numbers remain outside the Back Office model.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS profile_setup_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS identity_configured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS identity_consent_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS service_access_policy_version varchar(80),
  ADD COLUMN IF NOT EXISTS service_access_source varchar(40),
  ADD COLUMN IF NOT EXISTS service_access_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_source_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS customers_service_access_queue_idx
  ON customers(
    tenant_id,
    profile_setup_complete,
    terms_accepted,
    phone_verified_at,
    identity_configured,
    identity_consent_accepted,
    identity_status,
    updated_at DESC
  );
CREATE INDEX IF NOT EXISTS customers_identity_source_order_idx
  ON customers(tenant_id,identity_source_updated_at DESC);

CREATE TABLE IF NOT EXISTS identity_provider_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_code varchar(80) NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  supports_sync boolean NOT NULL DEFAULT false,
  supports_async boolean NOT NULL DEFAULT false,
  supported_identity_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  supported_countries text[] NOT NULL DEFAULT ARRAY[]::text[],
  source varchar(40) NOT NULL DEFAULT 'CPAY' CHECK (source IN ('CPAY','CONFIG')),
  source_reference varchar(255),
  source_updated_at timestamptz NOT NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_code)
);

CREATE INDEX IF NOT EXISTS identity_provider_capabilities_lookup_idx
  ON identity_provider_capabilities(tenant_id,enabled,provider_code);
CREATE INDEX IF NOT EXISTS identity_provider_capabilities_source_order_idx
  ON identity_provider_capabilities(tenant_id,source_updated_at DESC);

ALTER TABLE identity_provider_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_provider_capabilities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS identity_provider_capabilities_tenant_policy ON identity_provider_capabilities;
CREATE POLICY identity_provider_capabilities_tenant_policy ON identity_provider_capabilities
  USING (tenant_id=app.current_tenant_id() OR app.is_platform_admin())
  WITH CHECK (tenant_id=app.current_tenant_id() OR app.is_platform_admin());

INSERT INTO permissions(code,description) VALUES
 ('customer.identity.capability.read','View configured identity-provider document and country coverage'),
 ('customer.identity.capability.sync','Synchronize authoritative identity-provider capabilities from CPay')
ON CONFLICT(code) DO UPDATE SET description=EXCLUDED.description;

-- Human system-defined roles receive read visibility only. Identity-state and provider-capability
-- sync permissions are deliberately not granted by default; a dedicated integration/service
-- principal must be provisioned and explicitly assigned them.
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.system_defined=true AND p.code='customer.identity.capability.read'
ON CONFLICT DO NOTHING;

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id=r.id
  AND rp.permission_id=p.id
  AND r.system_defined=true
  AND p.code IN ('customer.identity.sync','customer.identity.capability.sync');
