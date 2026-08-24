import type {
  ConnectorEnvironment,
  ConnectorRecord,
  Principal,
  ProviderType
} from "@nolivendaz/canonical-models";
import type { ProviderSettlement } from "@nolivendaz/provider-sdk";
import { withTenantContext } from "@nolivendaz/database";

const context = (principal: Principal) => ({
  tenantId: principal.tenantId,
  isPlatformAdmin: principal.isPlatformAdmin,
  userId: principal.userId
});

function connectorFromRow(row: Record<string, unknown>): ConnectorRecord {
  return {
    id: String(row.connectorId),
    providerId: String(row.connectorProviderId),
    name: String(row.connectorName),
    environment: row.environment as ConnectorRecord["environment"],
    apiVersion: row.apiVersion as string | null,
    baseUrl: String(row.baseUrl),
    authType: row.authType as ConnectorRecord["authType"],
    credentialReference: row.credentialReference as string | null,
    webhookSecretReference: row.webhookSecretReference as string | null,
    timeoutMs: Number(row.timeoutMs),
    retryPolicy: row.retryPolicy as Record<string, unknown>,
    runtimeConfiguration: row.runtimeConfiguration as Record<string, unknown>,
    healthCheckPath: row.healthCheckPath as string | null,
    status: row.connectorStatus as ConnectorRecord["status"],
    enabled: Boolean(row.enabled),
    createdAt: String(row.connectorCreatedAt),
    updatedAt: String(row.connectorUpdatedAt)
  };
}

const connectorSelect = `
  p.provider_type AS "providerType",
  pc.id AS "connectorId",
  pc.provider_id AS "connectorProviderId",
  pc.name AS "connectorName",
  pc.environment,
  pc.api_version AS "apiVersion",
  pc.base_url AS "baseUrl",
  pc.auth_type AS "authType",
  pc.credential_reference AS "credentialReference",
  pc.webhook_secret_reference AS "webhookSecretReference",
  pc.timeout_ms AS "timeoutMs",
  pc.retry_policy AS "retryPolicy",
  pc.runtime_configuration AS "runtimeConfiguration",
  pc.health_check_path AS "healthCheckPath",
  pc.status AS "connectorStatus",
  pc.enabled,
  pc.created_at AS "connectorCreatedAt",
  pc.updated_at AS "connectorUpdatedAt"`;

export async function validateVendInput(
  principal: Principal,
  input: {
    merchantId: string;
    serviceId: string;
    productId?: string;
    siteId?: string;
    amount: string;
    currency: string;
  }
): Promise<void> {
  await withTenantContext(context(principal), async (client) => {
    const merchant = (await client.query(
      `SELECT id, country
         FROM merchants
        WHERE id = $1 AND tenant_id = $2 AND status = 'ACTIVE'`,
      [input.merchantId, principal.tenantId]
    )).rows[0];
    if (!merchant) throw new Error("MERCHANT_NOT_FOUND_OR_NOT_ACTIVE");

    if (input.siteId) {
      const site = (await client.query(
        `SELECT id
           FROM sites
          WHERE id = $1
            AND tenant_id = $2
            AND merchant_id = $3
            AND status = 'ACTIVE'`,
        [input.siteId, principal.tenantId, input.merchantId]
      )).rows[0];
      if (!site) throw new Error("SITE_NOT_FOUND_FOR_MERCHANT");
    }

    const service = (await client.query(
      `SELECT id
         FROM services
        WHERE id = $1
          AND status = 'ACTIVE'
          AND (tenant_id IS NULL OR tenant_id = $2)`,
      [input.serviceId, principal.tenantId]
    )).rows[0];
    if (!service) throw new Error("SERVICE_NOT_FOUND_OR_NOT_ACTIVE");

    if (!input.productId) return;

    const product = (await client.query(
      `SELECT
         id,
         currency,
         min_amount::text AS "minAmount",
         max_amount::text AS "maxAmount",
         fixed_price::text AS "fixedPrice",
         variable_amount_allowed AS "variableAmountAllowed"
       FROM products
       WHERE id = $1
         AND service_id = $2
         AND enabled = true
         AND (tenant_id IS NULL OR tenant_id = $3)`,
      [input.productId, input.serviceId, principal.tenantId]
    )).rows[0];
    if (!product) throw new Error("PRODUCT_NOT_FOUND_FOR_SERVICE");

    if (product.currency && String(product.currency).toUpperCase() !== input.currency) {
      throw new Error("PRODUCT_CURRENCY_MISMATCH");
    }

    const checks = (await client.query(
      `SELECT
         ($1::numeric > 0) AS positive,
         ($2::numeric IS NULL OR $1::numeric >= $2::numeric) AS above_minimum,
         ($3::numeric IS NULL OR $1::numeric <= $3::numeric) AS below_maximum,
         ($4::numeric IS NULL OR $1::numeric = $4::numeric) AS fixed_price_match`,
      [input.amount, product.minAmount, product.maxAmount, product.fixedPrice]
    )).rows[0];

    if (!checks?.positive) throw new Error("PRODUCT_AMOUNT_MUST_BE_POSITIVE");
    if (!checks.above_minimum) throw new Error("PRODUCT_AMOUNT_BELOW_MINIMUM");
    if (!checks.below_maximum) throw new Error("PRODUCT_AMOUNT_ABOVE_MAXIMUM");

    if (product.variableAmountAllowed === false) {
      if (product.fixedPrice == null) throw new Error("FIXED_PRICE_PRODUCT_MISSING_PRICE");
      if (!checks.fixed_price_match) throw new Error("PRODUCT_FIXED_PRICE_MISMATCH");
    }
  });
}

export interface DispatchClaim {
  claimed: boolean;
  dispatchState: string;
  transactionStatus?: string;
}

export async function claimVendDispatch(
  principal: Principal,
  transactionId: string,
  leaseSeconds = 90
): Promise<DispatchClaim> {
  return withTenantContext(context(principal), async (client) => {
    const claimed = (await client.query(
      `UPDATE transactions
          SET vend_dispatch_state = 'DISPATCHING',
              vend_dispatch_lease_until = now() + make_interval(secs => $2),
              vend_dispatch_attempts = vend_dispatch_attempts + 1,
              provider_submission_at = COALESCE(provider_submission_at, now()),
              vend_dispatched_at = COALESCE(vend_dispatched_at, now()),
              updated_at = now()
        WHERE id = $1
          AND payment_status = 'SUCCESS'
          AND normalized_status = 'SUBMITTED'
          AND (
            vend_dispatch_state = 'READY'
            OR (
              vend_dispatch_state = 'DISPATCHING'
              AND (vend_dispatch_lease_until IS NULL OR vend_dispatch_lease_until < now())
            )
          )
        RETURNING vend_dispatch_state AS "dispatchState", normalized_status AS status`,
      [transactionId, leaseSeconds]
    )).rows[0];

    if (claimed) {
      return {
        claimed: true,
        dispatchState: String(claimed.dispatchState),
        transactionStatus: String(claimed.status)
      };
    }

    const current = (await client.query(
      `SELECT vend_dispatch_state AS "dispatchState", normalized_status AS status
         FROM transactions
        WHERE id = $1`,
      [transactionId]
    )).rows[0];
    if (!current) throw new Error("TRANSACTION_NOT_FOUND");

    return {
      claimed: false,
      dispatchState: String(current.dispatchState),
      transactionStatus: String(current.status)
    };
  });
}

export async function completeVendDispatch(
  principal: Principal,
  transactionId: string,
  outcome: "CONFIRMED" | "FAILED" | "UNKNOWN"
): Promise<void> {
  await withTenantContext(context(principal), async (client) => {
    const state = outcome === "CONFIRMED"
      ? "COMPLETED"
      : outcome === "FAILED"
        ? "FAILED"
        : "UNKNOWN";
    await client.query(
      `UPDATE transactions
          SET vend_dispatch_state = $2,
              vend_dispatch_lease_until = NULL,
              updated_at = now()
        WHERE id = $1`,
      [transactionId, state]
    );
  });
}

export interface ApprovedRefundRuntime {
  refundId: string;
  transactionId: string;
  providerType: ProviderType;
  connector: ConnectorRecord;
  providerTransactionId: string;
  amount: string;
  currency: string;
  reason: string;
  idempotencyKey: string;
}

export async function getApprovedRefundRuntime(
  principal: Principal,
  refundId: string
): Promise<ApprovedRefundRuntime> {
  return withTenantContext(context(principal), async (client) => {
    const row = (await client.query(
      `SELECT
         r.id AS "refundId",
         r.transaction_id AS "transactionId",
         r.amount::text,
         r.currency,
         r.reason,
         r.idempotency_key AS "idempotencyKey",
         t.provider_transaction_id AS "providerTransactionId",
         ${connectorSelect}
       FROM refunds r
       JOIN transactions t ON t.id = r.transaction_id
       JOIN providers p ON p.id = r.provider_id
       JOIN provider_connectors pc ON pc.id = r.connector_id
       WHERE r.id = $1 AND r.status = 'APPROVED'`,
      [refundId]
    )).rows[0] as Record<string, unknown> | undefined;

    if (!row) throw new Error("APPROVED_REFUND_NOT_FOUND");
    if (!row.providerTransactionId) throw new Error("PROVIDER_TRANSACTION_REFERENCE_REQUIRED");

    return {
      refundId: String(row.refundId),
      transactionId: String(row.transactionId),
      providerType: row.providerType as ProviderType,
      connector: connectorFromRow(row),
      providerTransactionId: String(row.providerTransactionId),
      amount: String(row.amount),
      currency: String(row.currency),
      reason: String(row.reason),
      idempotencyKey: String(row.idempotencyKey)
    };
  });
}

export async function claimRefundDispatch(
  principal: Principal,
  refundId: string,
  leaseSeconds = 90
): Promise<{ claimed: boolean; dispatchState: string; refundStatus: string }> {
  return withTenantContext(context(principal), async (client) => {
    const claimed = (await client.query(
      `UPDATE refunds
          SET dispatch_state = 'DISPATCHING',
              dispatch_lease_until = now() + make_interval(secs => $2),
              dispatch_attempts = dispatch_attempts + 1,
              dispatch_started_at = COALESCE(dispatch_started_at, now()),
              updated_at = now()
        WHERE id = $1
          AND status = 'APPROVED'
          AND (
            dispatch_state IN ('NOT_READY','READY')
            OR (
              dispatch_state = 'DISPATCHING'
              AND (dispatch_lease_until IS NULL OR dispatch_lease_until < now())
            )
          )
        RETURNING dispatch_state AS "dispatchState", status`,
      [refundId, leaseSeconds]
    )).rows[0];

    if (claimed) {
      return {
        claimed: true,
        dispatchState: String(claimed.dispatchState),
        refundStatus: String(claimed.status)
      };
    }

    const current = (await client.query(
      `SELECT dispatch_state AS "dispatchState", status
         FROM refunds
        WHERE id = $1`,
      [refundId]
    )).rows[0];
    if (!current) throw new Error("REFUND_NOT_FOUND");

    return {
      claimed: false,
      dispatchState: String(current.dispatchState),
      refundStatus: String(current.status)
    };
  });
}

export async function completeRefundDispatch(
  principal: Principal,
  refundId: string,
  outcome: "CONFIRMED" | "FAILED" | "UNKNOWN"
): Promise<void> {
  await withTenantContext(context(principal), async (client) => {
    const state = outcome === "CONFIRMED"
      ? "COMPLETED"
      : outcome === "FAILED"
        ? "FAILED"
        : "UNKNOWN";
    await client.query(
      `UPDATE refunds
          SET dispatch_state = $2,
              dispatch_lease_until = NULL,
              updated_at = now()
        WHERE id = $1`,
      [refundId, state]
    );
  });
}

export async function upsertSettlementsTenantSafe(
  principal: Principal,
  providerId: string,
  connectorId: string,
  settlements: ProviderSettlement[]
): Promise<number> {
  return withTenantContext(context(principal), async (client) => {
    for (const settlement of settlements) {
      await client.query(
        `INSERT INTO provider_settlements (
           tenant_id, provider_id, connector_id, provider_settlement_id,
           currency, gross_amount, net_amount, provider_status,
           period_start, period_end
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (tenant_id, connector_id, provider_settlement_id)
         DO UPDATE SET
           gross_amount = EXCLUDED.gross_amount,
           net_amount = EXCLUDED.net_amount,
           provider_status = EXCLUDED.provider_status,
           period_start = EXCLUDED.period_start,
           period_end = EXCLUDED.period_end,
           fetched_at = now()`,
        [
          principal.tenantId,
          providerId,
          connectorId,
          settlement.providerSettlementId,
          settlement.currency,
          settlement.grossAmount,
          settlement.netAmount,
          settlement.status,
          settlement.periodStart,
          settlement.periodEnd
        ]
      );
    }

    await client.query(
      `INSERT INTO audit_logs (
         tenant_id, actor_user_id, action, resource_type, after_state
       ) VALUES ($1,$2,'settlement.sync','provider',$3::jsonb)`,
      [
        principal.tenantId,
        principal.userId,
        JSON.stringify({ providerId, connectorId, records: settlements.length })
      ]
    );

    return settlements.length;
  });
}

export async function resolveClearedReconciliationExceptions(
  principal: Principal,
  graceMinutes: number
): Promise<number> {
  return withTenantContext(context(principal), async (client) => {
    const result = await client.query(
      `UPDATE reconciliation_exceptions re
          SET status = 'RESOLVED', resolved_at = now()
         FROM transactions t
        WHERE re.transaction_id = t.id
          AND re.tenant_id = $1
          AND re.status IN ('OPEN','INVESTIGATING')
          AND (
            (
              re.exception_type = 'PAID_NOT_FULFILLED'
              AND NOT (
                t.payment_status = 'SUCCESS'
                AND t.vend_status <> 'FULFILLED'
                AND t.normalized_status <> 'REFUNDED'
                AND t.created_at < now() - make_interval(mins => $2)
              )
            )
            OR (
              re.exception_type = 'REFUND_PENDING_TOO_LONG'
              AND NOT (
                t.refund_required = true
                AND (t.refund_status IS NULL OR t.refund_status IN ('PENDING','UNKNOWN','REQUESTED','PARTIAL','FAILED'))
                AND t.updated_at < now() - interval '24 hours'
              )
            )
            OR (
              re.exception_type = 'FULFILLED_NOT_SETTLED'
              AND NOT (
                t.vend_status = 'FULFILLED'
                AND t.normalized_status <> 'REFUNDED'
                AND t.settlement_blocked = false
                AND COALESCE(t.settlement_status, '') <> 'SETTLED'
                AND t.updated_at < now() - interval '24 hours'
              )
            )
          )`,
      [principal.tenantId, graceMinutes]
    );
    return result.rowCount ?? 0;
  });
}
