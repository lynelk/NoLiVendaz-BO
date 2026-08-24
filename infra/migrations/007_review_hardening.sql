-- Final review hardening for completion baseline.
-- Keep this migration explicit so existing environments that already applied 006
-- converge to the same corrected schema as fresh deployments.

ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_tenant_id_external_reference_key;

CREATE UNIQUE INDEX IF NOT EXISTS customers_external_reference_unique
  ON customers(tenant_id, external_reference)
  WHERE external_reference IS NOT NULL;

DROP INDEX IF EXISTS alerts_open_source_unique;
CREATE UNIQUE INDEX IF NOT EXISTS alerts_active_source_unique
  ON alerts(tenant_id, source_key)
  WHERE source_key IS NOT NULL
    AND status IN ('OPEN','ACKNOWLEDGED','SUPPRESSED');
