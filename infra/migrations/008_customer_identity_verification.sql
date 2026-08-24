-- Customer identity visibility for the NOLI Vendaz progressive-verification flow.
-- Back Office stores only masked identity data and authoritative source references. It never stores
-- raw identity numbers and cannot manufacture CPay verification outcomes.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_type varchar(40),
  ADD COLUMN IF NOT EXISTS identity_country char(2),
  ADD COLUMN IF NOT EXISTS identity_number_mask varchar(64),
  ADD COLUMN IF NOT EXISTS identity_status varchar(40) NOT NULL DEFAULT 'NOT_SUBMITTED'
    CHECK (identity_status IN ('NOT_SUBMITTED','FORMAT_VALID','VERIFICATION_PENDING','VERIFIED','VERIFICATION_FAILED','REVIEW_REQUIRED')),
  ADD COLUMN IF NOT EXISTS identity_provider varchar(80),
  ADD COLUMN IF NOT EXISTS identity_provider_reference varchar(255),
  ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_version varchar(80),
  ADD COLUMN IF NOT EXISTS consent_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_source varchar(40),
  ADD COLUMN IF NOT EXISTS identity_last_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS customers_identity_queue_idx
  ON customers(tenant_id,identity_status,updated_at DESC);
CREATE INDEX IF NOT EXISTS customers_phone_verified_idx
  ON customers(tenant_id,phone_verified_at) WHERE phone_verified_at IS NOT NULL;

INSERT INTO permissions(code,description) VALUES
 ('customer.read','View customer profile and service-access readiness'),
 ('customer.identity.read','View masked customer identity verification state'),
 ('customer.identity.sync','Synchronize authoritative masked identity state from NOLI/CPay')
ON CONFLICT(code) DO UPDATE SET description=EXCLUDED.description;

-- System-defined roles receive read-only customer visibility. Identity synchronization remains a
-- deliberately narrower permission and is assigned only to system roles that already manage audit.
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.system_defined=true AND p.code IN ('customer.read','customer.identity.read')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.system_defined=true
  AND EXISTS (
    SELECT 1 FROM role_permissions rp
    JOIN permissions existing ON existing.id=rp.permission_id
    WHERE rp.role_id=r.id AND existing.code='admin.audit.read'
  )
  AND p.code='customer.identity.sync'
ON CONFLICT DO NOTHING;
