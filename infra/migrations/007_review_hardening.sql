-- Final review hardening for completion baseline.
-- Existing environments that already applied 006 converge to the same corrected
-- schema and invariants as fresh deployments.

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

CREATE OR REPLACE FUNCTION app.validate_route_references()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM services s
     WHERE s.id=NEW.service_id
       AND (s.tenant_id IS NULL OR s.tenant_id=NEW.tenant_id)
  ) THEN RAISE EXCEPTION 'ROUTE_SERVICE_NOT_VISIBLE'; END IF;

  IF NEW.product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM products p
     WHERE p.id=NEW.product_id
       AND p.service_id=NEW.service_id
       AND (p.tenant_id IS NULL OR p.tenant_id=NEW.tenant_id)
  ) THEN RAISE EXCEPTION 'ROUTE_PRODUCT_NOT_VISIBLE'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM providers p
     WHERE p.id=NEW.primary_provider_id
       AND (p.scope='PLATFORM' OR p.tenant_id=NEW.tenant_id)
  ) THEN RAISE EXCEPTION 'ROUTE_PRIMARY_PROVIDER_NOT_VISIBLE'; END IF;

  IF NEW.secondary_provider_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM providers p
     WHERE p.id=NEW.secondary_provider_id
       AND (p.scope='PLATFORM' OR p.tenant_id=NEW.tenant_id)
  ) THEN RAISE EXCEPTION 'ROUTE_SECONDARY_PROVIDER_NOT_VISIBLE'; END IF;

  IF NEW.merchant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM merchants m
     WHERE m.id=NEW.merchant_id AND m.tenant_id=NEW.tenant_id
  ) THEN RAISE EXCEPTION 'ROUTE_MERCHANT_NOT_VISIBLE'; END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS routes_validate_references ON routes;
CREATE TRIGGER routes_validate_references
BEFORE INSERT OR UPDATE OF merchant_id,service_id,product_id,primary_provider_id,secondary_provider_id,tenant_id
ON routes
FOR EACH ROW EXECUTE FUNCTION app.validate_route_references();

CREATE OR REPLACE FUNCTION app.sync_transaction_payment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.payment_reference IS NULL THEN RETURN NEW; END IF;

  INSERT INTO payments(
    tenant_id,transaction_id,payment_reference,currency,amount,status,paid_at,metadata
  ) VALUES(
    NEW.tenant_id,NEW.id,NEW.payment_reference,NEW.currency,NEW.total_amount,
    COALESCE(NEW.payment_status,'UNKNOWN'),
    CASE WHEN NEW.payment_status='SUCCESS' THEN COALESCE(NEW.created_at,now()) ELSE NULL END,
    jsonb_build_object('source','transaction')
  )
  ON CONFLICT (tenant_id,payment_reference) DO UPDATE SET
    transaction_id=EXCLUDED.transaction_id,
    currency=EXCLUDED.currency,
    amount=EXCLUDED.amount,
    status=EXCLUDED.status,
    paid_at=COALESCE(payments.paid_at,EXCLUDED.paid_at),
    updated_at=now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS transactions_sync_payment ON transactions;
CREATE TRIGGER transactions_sync_payment
AFTER INSERT OR UPDATE OF payment_status,payment_reference,total_amount,currency
ON transactions
FOR EACH ROW EXECUTE FUNCTION app.sync_transaction_payment();

-- Backfill the canonical payment ledger for transactions created before this migration.
INSERT INTO payments(
  tenant_id,transaction_id,payment_reference,currency,amount,status,paid_at,metadata
)
SELECT
  t.tenant_id,t.id,t.payment_reference,t.currency,t.total_amount,
  COALESCE(t.payment_status,'UNKNOWN'),
  CASE WHEN t.payment_status='SUCCESS' THEN t.created_at ELSE NULL END,
  jsonb_build_object('source','transaction-backfill')
FROM transactions t
WHERE t.payment_reference IS NOT NULL
ON CONFLICT (tenant_id,payment_reference) DO UPDATE SET
  transaction_id=EXCLUDED.transaction_id,
  currency=EXCLUDED.currency,
  amount=EXCLUDED.amount,
  status=EXCLUDED.status,
  paid_at=COALESCE(payments.paid_at,EXCLUDED.paid_at),
  updated_at=now();
