-- ISO financial-message governance metadata.
-- This migration stores approved profile/version and traceability evidence only.
-- It intentionally does not store raw card/authentication payloads in ordinary tables.

-- Correct the nullable external-reference uniqueness from migration 006 so tenants
-- may have multiple customers without an external reference while still preventing
-- duplicate non-null external references.
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_tenant_id_external_reference_key;
CREATE UNIQUE INDEX IF NOT EXISTS customers_external_reference_unique
  ON customers(tenant_id, external_reference)
  WHERE external_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS financial_message_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  profile_code varchar(120) NOT NULL,
  provider_id uuid REFERENCES providers(id) ON DELETE SET NULL,
  connector_id uuid REFERENCES provider_connectors(id) ON DELETE SET NULL,
  standard varchar(20) NOT NULL CHECK (standard IN ('ISO20022','ISO8583')),
  standard_version varchar(80) NOT NULL,
  business_service varchar(160) NOT NULL,
  message_definition varchar(200) NOT NULL,
  mapping_version varchar(80) NOT NULL,
  lifecycle_state varchar(24) NOT NULL DEFAULT 'DRAFT'
    CHECK (lifecycle_state IN ('DRAFT','TESTING','CERTIFIED','ACTIVE','DEPRECATED','RETIRED')),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  schema_reference text,
  market_practice_reference text,
  bic_validation_source text,
  certification_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, profile_code, mapping_version),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK (lifecycle_state <> 'ACTIVE' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS financial_message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  profile_id uuid NOT NULL REFERENCES financial_message_profiles(id),
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  correlation_id varchar(200) NOT NULL,
  standard varchar(20) NOT NULL CHECK (standard IN ('ISO20022','ISO8583')),
  direction varchar(12) NOT NULL CHECK (direction IN ('INBOUND','OUTBOUND')),
  sender_identifier varchar(200),
  receiver_identifier varchar(200),
  sender_bic varchar(11),
  receiver_bic varchar(11),
  event_timestamp timestamptz NOT NULL,
  observed_timestamp timestamptz NOT NULL DEFAULT now(),
  validation_status varchar(20) NOT NULL CHECK (validation_status IN ('VALID','INVALID','QUARANTINED')),
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_digest varchar(71) NOT NULL CHECK (content_digest ~ '^sha256:[0-9a-f]{64}$'),
  raw_storage_reference text,
  external_reference varchar(240),
  mapping_version varchar(80) NOT NULL,
  processing_result varchar(80),
  duplicate_detected boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_bic IS NULL OR sender_bic ~ '^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$'),
  CHECK (receiver_bic IS NULL OR receiver_bic ~ '^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$')
);

CREATE INDEX IF NOT EXISTS financial_message_profiles_active_idx
  ON financial_message_profiles(tenant_id, standard, lifecycle_state, effective_from DESC);
CREATE INDEX IF NOT EXISTS financial_message_events_transaction_idx
  ON financial_message_events(tenant_id, transaction_id, observed_timestamp DESC);
CREATE INDEX IF NOT EXISTS financial_message_events_correlation_idx
  ON financial_message_events(tenant_id, correlation_id, observed_timestamp DESC);
CREATE INDEX IF NOT EXISTS financial_message_events_external_ref_idx
  ON financial_message_events(tenant_id, external_reference)
  WHERE external_reference IS NOT NULL;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['financial_message_profiles','financial_message_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_tenant_policy ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_tenant_policy ON %I USING (tenant_id=app.current_tenant_id() OR app.is_platform_admin()) WITH CHECK (tenant_id=app.current_tenant_id() OR app.is_platform_admin())',
      t, t
    );
  END LOOP;
END $$;

INSERT INTO permissions(code,description) VALUES
  ('financial_message.read','View approved financial-message profiles and traceability evidence'),
  ('financial_message.manage','Manage and approve financial-message profiles')
ON CONFLICT(code) DO UPDATE SET description=EXCLUDED.description;
