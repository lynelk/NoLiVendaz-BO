import type {
  ConnectorEnvironment,
  ConnectorRecord,
  Principal,
  ProviderType,
  TransactionStatus,
  VendStatus
} from "@nolivendaz/canonical-models";
import type {
  ProviderSettlement,
  RefundResponse,
  VendResponse
} from "@nolivendaz/provider-sdk";
import { withTenantContext } from "@nolivendaz/database";

const dbContext = (principal: Principal) => ({
  tenantId: principal.tenantId,
  isPlatformAdmin: principal.isPlatformAdmin,
  userId: principal.userId
});

export interface RoutedRuntime {
  transactionId: string;
  reference: string;
  correlationId: string;
  routeId: string;
  providerId: string;
  providerType: ProviderType;
  connector: ConnectorRecord;
  serviceCode: string;
  productCode?: string;
  providerMerchantId?: string;
  providerSiteId?: string;
  existing: boolean;
}

export interface RoutedVendInput {
  merchantId: string;
  serviceId: string;
  productId?: string;
  siteId?: string;
  amount: string;
  currency: string;
  paymentReference: string;
  idempotencyKey: string;
  correlationId: string;
  customerReference?: string;
  metadata?: Record<string, unknown>;
  environment: ConnectorEnvironment;
}

function connectorFromRow(row: Record<string, unknown>): ConnectorRecord {
  return {
    id: String(row.connectorId),
    providerId: String(row.connectorProviderId ?? row.providerId ?? row.provider_id),
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

const runtimeSelect = `
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

function normalizedStatusFromVend(vendStatus: VendStatus): TransactionStatus {
  if (vendStatus === "FULFILLED") return "FULFILLED";
  if (vendStatus === "FAILED") return "FAILED";
  if (vendStatus === "CANCELLED") return "CANCELLED";
  if (vendStatus === "UNKNOWN") return "UNKNOWN";
  if (vendStatus === "ACCEPTED") return "ACCEPTED";
  return "SUBMITTED";
}

function vendNeedsFullRefund(vendStatus: unknown): boolean {
  return vendStatus === "FAILED" || vendStatus === "CANCELLED";
}

export async function prepareRoutedVend(
  principal: Principal,
  input: RoutedVendInput
): Promise<RoutedRuntime> {
  return withTenantContext(dbContext(principal), async (client) => {
    const existing = await client.query(
      `SELECT
         t.id AS "transactionId",
         t.transaction_reference AS reference,
         t.correlation_id AS "correlationId",
         t.route_id AS "routeId",
         t.provider_id AS "providerId",
         s.code AS "serviceCode",
         pp.provider_product_code AS "productCode",
         ${runtimeSelect}
       FROM transactions t
       JOIN providers p ON p.id = t.provider_id
       JOIN provider_connectors pc ON pc.id = t.connector_id
       JOIN services s ON s.id = t.service_id
       LEFT JOIN provider_products pp
         ON pp.provider_id = t.provider_id AND pp.product_id = t.product_id
       WHERE t.tenant_id = $1 AND t.idempotency_key = $2`,
      [principal.tenantId, input.idempotencyKey]
    );

    if (existing.rows[0]) {
      const row = existing.rows[0] as Record<string, unknown>;
      return {
        transactionId: String(row.transactionId),
        reference: String(row.reference),
        correlationId: String(row.correlationId),
        routeId: String(row.routeId),
        providerId: String(row.providerId),
        providerType: row.providerType as ProviderType,
        connector: connectorFromRow(row),
        serviceCode: String(row.serviceCode),
        ...(row.productCode ? { productCode: String(row.productCode) } : {}),
        existing: true
      };
    }

    const selected = await client.query(
      `WITH candidates AS (
         SELECT r.*, r.primary_provider_id AS candidate_provider_id,
                'PRIMARY'::text AS selected_role, 0 AS candidate_rank
           FROM routes r
         UNION ALL
         SELECT r.*, r.secondary_provider_id AS candidate_provider_id,
                'SECONDARY'::text AS selected_role, 1 AS candidate_rank
           FROM routes r
          WHERE r.secondary_provider_id IS NOT NULL
       )
       SELECT
         x.id AS "routeId",
         x.candidate_provider_id AS "providerId",
         x.selected_role AS "selectedRole",
         s.code AS "serviceCode",
         pp.provider_product_code AS "productCode",
         mpm.provider_merchant_id AS "providerMerchantId",
         spm.provider_site_id AS "providerSiteId",
         COALESCE(h.health_status, 'UNKNOWN') AS "healthStatus",
         ${runtimeSelect}
       FROM candidates x
       JOIN merchants m
         ON m.id = $2::uuid AND m.tenant_id = $1
       LEFT JOIN sites si
         ON si.id = $7::uuid AND si.merchant_id = m.id
       JOIN providers p ON p.id = x.candidate_provider_id
       JOIN services s ON s.id = x.service_id
       LEFT JOIN provider_products pp
         ON pp.provider_id = p.id
        AND pp.product_id = $3
        AND pp.enabled = true
       LEFT JOIN LATERAL (
         SELECT pc.*
           FROM provider_connectors pc
          WHERE pc.provider_id = p.id
            AND pc.enabled = true
            AND pc.environment = $6
            AND pc.status IN ('ACTIVE','DEGRADED')
            AND EXISTS (
              SELECT 1
                FROM connector_capabilities cc
                JOIN capabilities cap ON cap.id = cc.capability_id
               WHERE cc.connector_id = pc.id
                 AND cc.enabled = true
                 AND cap.code = 'vend.initiate'
            )
          ORDER BY CASE pc.status WHEN 'ACTIVE' THEN 0 ELSE 1 END,
                   pc.created_at DESC
          LIMIT 1
       ) pc ON true
       LEFT JOIN LATERAL (
         SELECT health_status
           FROM provider_health_events phe
          WHERE phe.connector_id = pc.id
          ORDER BY checked_at DESC
          LIMIT 1
       ) h ON true
       LEFT JOIN merchant_provider_mappings mpm
         ON mpm.merchant_id = m.id AND mpm.provider_id = p.id
       LEFT JOIN site_provider_mappings spm
         ON spm.site_id = si.id AND spm.provider_id = p.id
       WHERE x.tenant_id = $1
         AND (x.merchant_id IS NULL OR x.merchant_id = m.id)
         AND x.service_id = $4
         AND (x.product_id IS NULL OR x.product_id = $3::uuid)
         AND (x.country IS NULL OR x.country = m.country)
         AND (x.region IS NULL OR x.region = si.region)
         AND (x.currency IS NULL OR x.currency = $5)
         AND ($7::uuid IS NULL OR si.id IS NOT NULL)
         AND ($3::uuid IS NULL OR pp.product_id IS NOT NULL)
         AND (
           COALESCE(pc.runtime_configuration #>> '{routing,requireMerchantMapping}', 'false') <> 'true'
           OR mpm.id IS NOT NULL
         )
         AND (
           COALESCE(pc.runtime_configuration #>> '{routing,requireSiteMapping}', 'false') <> 'true'
           OR spm.id IS NOT NULL
         )
         AND x.enabled = true
         AND now() >= x.effective_from
         AND (x.effective_to IS NULL OR now() < x.effective_to)
         AND (
           ($6 = 'PRODUCTION' AND p.status IN ('PRODUCTION','DEGRADED')) OR
           ($6 = 'STAGING' AND p.status IN ('CERTIFIED','PRODUCTION','DEGRADED')) OR
           ($6 = 'SANDBOX' AND p.status IN ('SANDBOX','CERTIFIED','PRODUCTION','DEGRADED')) OR
           ($6 = 'DEVELOPMENT' AND p.status IN ('DEVELOPMENT','SANDBOX','CERTIFIED','PRODUCTION','DEGRADED'))
         )
         AND pc.id IS NOT NULL
         AND COALESCE(h.health_status, 'UNKNOWN') NOT IN ('OUTAGE','MAINTENANCE')
       ORDER BY x.priority, x.candidate_rank
       LIMIT 1`,
      [
        principal.tenantId,
        input.merchantId,
        input.productId ?? null,
        input.serviceId,
        input.currency,
        input.environment,
        input.siteId ?? null
      ]
    );

    const row = selected.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error("NO_ELIGIBLE_VENDING_ROUTE");

    const providerMappingMetadata = {
      ...(row.providerMerchantId
        ? { providerMerchantId: String(row.providerMerchantId) }
        : {}),
      ...(row.providerSiteId
        ? { providerSiteId: String(row.providerSiteId) }
        : {})
    };

    const inserted = await client.query(
      `INSERT INTO transactions (
         transaction_reference, correlation_id, tenant_id, merchant_id,
         provider_id, connector_id, service_id, product_id, site_id,
         currency, amount, total_amount, normalized_status, payment_status,
         vend_status, payment_reference, idempotency_key, route_id,
         transaction_metadata, provider_submission_at
       ) VALUES (
         'NV-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,20)),
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,
         'SUBMITTED','SUCCESS','SUBMITTED',$11,$12,$13,$14::jsonb,now()
       )
       RETURNING id, transaction_reference`,
      [
        input.correlationId,
        principal.tenantId,
        input.merchantId,
        row.providerId,
        row.connectorId,
        input.serviceId,
        input.productId ?? null,
        input.siteId ?? null,
        input.currency,
        input.amount,
        input.paymentReference,
        input.idempotencyKey,
        row.routeId,
        JSON.stringify({
          ...(input.customerReference ? { customerReference: input.customerReference } : {}),
          ...providerMappingMetadata,
          ...(input.metadata ?? {})
        })
      ]
    );

    const transaction = inserted.rows[0];
    if (!transaction) throw new Error("TRANSACTION_INSERT_RETURNED_NO_ROW");
    const transactionId = String(transaction.id);

    await client.query(
      `INSERT INTO route_decisions (
         tenant_id, transaction_id, route_id, selected_provider_id,
         selected_connector_id, selected_role, reason, health_status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        principal.tenantId,
        transactionId,
        row.routeId,
        row.providerId,
        row.connectorId,
        row.selectedRole,
        "Pre-dispatch route selected after geography, environment, lifecycle, mapping, capability and health gates",
        row.healthStatus
      ]
    );

    const routePayload = {
      routeId: row.routeId,
      providerId: row.providerId,
      connectorId: row.connectorId,
      selectedRole: row.selectedRole,
      healthStatus: row.healthStatus,
      environment: input.environment,
      ...providerMappingMetadata
    };

    await client.query(
      `INSERT INTO transaction_events (
         tenant_id, transaction_id, event_type, normalized_status,
         payload, source, correlation_id
       ) VALUES ($1,$2,'route.selected','SUBMITTED',$3::jsonb,'routing',$4)`,
      [principal.tenantId, transactionId, JSON.stringify(routePayload), input.correlationId]
    );

    await client.query(
      `INSERT INTO audit_logs (
         tenant_id, actor_user_id, action, resource_type, resource_id,
         after_state, correlation_id
       ) VALUES ($1,$2,'vend.route.selected','transaction',$3,$4::jsonb,$5)`,
      [
        principal.tenantId,
        principal.userId,
        transactionId,
        JSON.stringify(routePayload),
        input.correlationId
      ]
    );

    return {
      transactionId,
      reference: String(transaction.transaction_reference),
      correlationId: input.correlationId,
      routeId: String(row.routeId),
      providerId: String(row.providerId),
      providerType: row.providerType as ProviderType,
      connector: connectorFromRow(row),
      serviceCode: String(row.serviceCode),
      ...(row.productCode ? { productCode: String(row.productCode) } : {}),
      ...(row.providerMerchantId
        ? { providerMerchantId: String(row.providerMerchantId) }
        : {}),
      ...(row.providerSiteId ? { providerSiteId: String(row.providerSiteId) } : {}),
      existing: false
    };
  });
}

export async function recordVendResult(
  principal: Principal,
  transactionId: string,
  result: { outcome: "CONFIRMED" | "FAILED" | "UNKNOWN"; response?: VendResponse; error?: string }
): Promise<void> {
  await withTenantContext(dbContext(principal), async (client) => {
    let vendStatus: VendStatus = "UNKNOWN";
    let providerStatus: string | null = null;
    let providerTransactionId: string | null = null;
    let normalizedStatus: TransactionStatus = "UNKNOWN";

    if (result.outcome === "CONFIRMED" && result.response) {
      vendStatus = result.response.status;
      providerStatus = result.response.providerStatus ?? null;
      providerTransactionId = result.response.providerTransactionId;
      normalizedStatus = normalizedStatusFromVend(vendStatus);
    } else if (result.outcome === "FAILED") {
      vendStatus = "FAILED";
      normalizedStatus = "FAILED";
    }

    const refundRequired = vendNeedsFullRefund(vendStatus);
    const settlementBlocked = normalizedStatus !== "FULFILLED";
    const holdReason = normalizedStatus === "FAILED"
      ? "PAID_VEND_FAILED"
      : normalizedStatus === "CANCELLED"
        ? "PAID_VEND_CANCELLED"
        : normalizedStatus === "UNKNOWN"
          ? "VEND_OUTCOME_UNKNOWN"
          : normalizedStatus !== "FULFILLED"
            ? "VEND_IN_PROGRESS"
            : null;

    await client.query(
      `UPDATE transactions
          SET normalized_status = $2,
              vend_status = $3,
              provider_status = $4,
              provider_transaction_id = COALESCE($5, provider_transaction_id),
              unknown_since = CASE
                WHEN $2 = 'UNKNOWN' THEN COALESCE(unknown_since, now())
                ELSE NULL
              END,
              refund_required = $6,
              settlement_blocked = $7,
              financial_hold_reason = $8,
              updated_at = now(),
              completed_at = CASE
                WHEN $2 IN ('FULFILLED','FAILED','CANCELLED') THEN COALESCE(completed_at, now())
                ELSE completed_at
              END
        WHERE id = $1`,
      [
        transactionId,
        normalizedStatus,
        vendStatus,
        providerStatus,
        providerTransactionId,
        refundRequired,
        settlementBlocked,
        holdReason
      ]
    );

    const payload = {
      vendStatus,
      providerTransactionId,
      refundRequired,
      settlementBlocked,
      holdReason,
      ...(result.error ? { error: result.error } : {})
    };

    await client.query(
      `INSERT INTO transaction_events (
         tenant_id, transaction_id, event_type, normalized_status,
         provider_status, payload, source
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,'vend-dispatch')`,
      [
        principal.tenantId,
        transactionId,
        result.outcome === "UNKNOWN"
          ? "vend.dispatch.unknown"
          : result.outcome === "FAILED"
            ? "vend.dispatch.failed"
            : "vend.dispatch.result",
        normalizedStatus,
        providerStatus,
        JSON.stringify(payload)
      ]
    );

    await client.query(
      `INSERT INTO audit_logs (
         tenant_id, actor_user_id, action, resource_type, resource_id, after_state
       ) VALUES ($1,$2,'vend.provider_result','transaction',$3,$4::jsonb)`,
      [
        principal.tenantId,
        principal.userId,
        transactionId,
        JSON.stringify({ outcome: result.outcome, status: normalizedStatus, ...payload })
      ]
    );
  });
}

export async function requestRefund(
  principal: Principal,
  transactionId: string,
  input: { amount: string; reason: string; idempotencyKey: string }
) {
  return withTenantContext(dbContext(principal), async (client) => {
    const existing = (await client.query(
      `SELECT * FROM refunds WHERE tenant_id = $1 AND idempotency_key = $2`,
      [principal.tenantId, input.idempotencyKey]
    )).rows[0];

    if (existing) {
      if (String(existing.transaction_id) !== transactionId) {
        throw new Error("REFUND_IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_TRANSACTION");
      }
      return existing;
    }

    const transaction = (await client.query(
      `SELECT
         id, provider_id, connector_id, currency,
         total_amount::text AS total_amount, payment_status,
         vend_status, normalized_status
       FROM transactions
       WHERE id = $1
       FOR UPDATE`,
      [transactionId]
    )).rows[0];

    if (!transaction) throw new Error("TRANSACTION_NOT_FOUND");
    if (transaction.payment_status !== "SUCCESS") {
      throw new Error("REFUND_REQUIRES_SUCCESSFUL_PAYMENT");
    }
    if (transaction.vend_status === "UNKNOWN" ||
        transaction.normalized_status === "UNKNOWN" ||
        transaction.normalized_status === "TIMED_OUT") {
      throw new Error("REFUND_BLOCKED_WHILE_VEND_OUTCOME_UNKNOWN");
    }
    if (!["FULFILLED","FAILED","CANCELLED"].includes(String(transaction.vend_status))) {
      throw new Error("REFUND_BLOCKED_UNTIL_VEND_TERMINAL");
    }

    const reservation = (await client.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (
           WHERE status NOT IN ('REJECTED','CANCELLED','FAILED')
         ), 0)::text AS reserved,
         ($2::numeric > $3::numeric) AS single_exceeds,
         (COALESCE(SUM(amount) FILTER (
           WHERE status NOT IN ('REJECTED','CANCELLED','FAILED')
         ), 0) + $2::numeric > $3::numeric) AS aggregate_exceeds
       FROM refunds
       WHERE transaction_id = $1`,
      [transactionId, input.amount, transaction.total_amount]
    )).rows[0];

    if (reservation.single_exceeds) throw new Error("REFUND_EXCEEDS_TRANSACTION_TOTAL");
    if (reservation.aggregate_exceeds) {
      throw new Error("CUMULATIVE_REFUNDS_EXCEED_TRANSACTION_TOTAL");
    }

    const refund = (await client.query(
      `INSERT INTO refunds (
         tenant_id, transaction_id, provider_id, connector_id, amount,
         currency, reason, idempotency_key, requested_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        principal.tenantId,
        transactionId,
        transaction.provider_id,
        transaction.connector_id,
        input.amount,
        transaction.currency,
        input.reason,
        input.idempotencyKey,
        principal.userId
      ]
    )).rows[0];

    if (!refund) throw new Error("REFUND_INSERT_RETURNED_NO_ROW");

    await client.query(
      `UPDATE transactions
          SET refund_status = 'REQUESTED',
              refund_required = true,
              normalized_status = 'REFUND_PENDING',
              settlement_blocked = true,
              financial_hold_reason = COALESCE(financial_hold_reason, 'REFUND_PENDING'),
              updated_at = now()
        WHERE id = $1`,
      [transactionId]
    );

    await client.query(
      `INSERT INTO audit_logs (
         tenant_id, actor_user_id, action, resource_type, resource_id, after_state
       ) VALUES ($1,$2,'refund.request','refund',$3,$4::jsonb)`,
      [
        principal.tenantId,
        principal.userId,
        refund.id,
        JSON.stringify({
          transactionId,
          amount: input.amount,
          currency: transaction.currency,
          reason: input.reason,
          reservedBefore: reservation.reserved
        })
      ]
    );

    return refund;
  });
}

export async function approveRefund(principal: Principal, refundId: string) {
  return withTenantContext(dbContext(principal), async (client) => {
    const row = (await client.query(
      `SELECT
         r.*,
         t.provider_transaction_id,
         p.id AS "providerId",
         ${runtimeSelect}
       FROM refunds r
       JOIN transactions t ON t.id = r.transaction_id
       JOIN providers p ON p.id = r.provider_id
       JOIN provider_connectors pc ON pc.id = r.connector_id
       WHERE r.id = $1
       FOR UPDATE`,
      [refundId]
    )).rows[0] as Record<string, unknown> | undefined;

    if (!row) throw new Error("REFUND_NOT_FOUND");
    if (row.status !== "REQUESTED") throw new Error("REFUND_NOT_AWAITING_APPROVAL");
    if (String(row.requested_by) === principal.userId) {
      throw new Error("MAKER_CHECKER_VIOLATION");
    }
    if (!row.provider_transaction_id) {
      throw new Error("PROVIDER_TRANSACTION_REFERENCE_REQUIRED");
    }

    await client.query(
      `UPDATE refunds
          SET status = 'APPROVED', approved_by = $2,
              approved_at = now(), updated_at = now()
        WHERE id = $1`,
      [refundId, principal.userId]
    );

    await client.query(
      `INSERT INTO audit_logs (
         tenant_id, actor_user_id, action, resource_type, resource_id, after_state
       ) VALUES ($1,$2,'refund.approve','refund',$3,$4::jsonb)`,
      [
        principal.tenantId,
        principal.userId,
        refundId,
        JSON.stringify({ transactionId: row.transaction_id, approved: true })
      ]
    );

    return {
      refundId,
      transactionId: String(row.transaction_id),
      providerType: row.providerType as ProviderType,
      connector: connectorFromRow(row),
      providerTransactionId: String(row.provider_transaction_id),
      amount: String(row.amount),
      currency: String(row.currency),
      reason: String(row.reason),
      idempotencyKey: String(row.idempotency_key)
    };
  });
}

export async function recordRefundResult(
  principal: Principal,
  refundId: string,
  transactionId: string,
  result: { outcome: "CONFIRMED" | "FAILED" | "UNKNOWN"; response?: RefundResponse; error?: string }
): Promise<void> {
  await withTenantContext(dbContext(principal), async (client) => {
    const status = result.outcome === "UNKNOWN"
      ? "UNKNOWN"
      : result.outcome === "FAILED"
        ? "FAILED"
        : result.response?.status ?? "PENDING";

    await client.query(
      `UPDATE refunds
          SET status = $2,
              provider_refund_id = COALESCE($3, provider_refund_id),
              provider_status = $4,
              completed_at = CASE WHEN $2 = 'COMPLETED' THEN now() ELSE completed_at END,
              updated_at = now()
        WHERE id = $1`,
      [
        refundId,
        status,
        result.response?.providerRefundId ?? null,
        result.response?.providerStatus ?? null
      ]
    );

    const aggregate = (await client.query(
      `SELECT
         t.total_amount::text AS total_amount,
         t.vend_status,
         COALESCE(SUM(r.amount) FILTER (WHERE r.status = 'COMPLETED'), 0)::text AS completed_amount,
         COALESCE(BOOL_OR(r.status IN ('REQUESTED','APPROVED','PENDING','UNKNOWN')), false) AS has_open,
         COALESCE(BOOL_OR(r.status = 'UNKNOWN'), false) AS has_unknown,
         COALESCE(BOOL_OR(r.status = 'FAILED'), false) AS has_failed
       FROM transactions t
       LEFT JOIN refunds r ON r.transaction_id = t.id
       WHERE t.id = $1
       GROUP BY t.id, t.total_amount, t.vend_status`,
      [transactionId]
    )).rows[0];

    if (!aggregate) throw new Error("REFUND_PARENT_TRANSACTION_NOT_FOUND");

    const fullyRefunded = (await client.query(
      `SELECT $1::numeric >= $2::numeric AS value`,
      [aggregate.completed_amount, aggregate.total_amount]
    )).rows[0]?.value === true;

    const completedPositive = (await client.query(
      `SELECT $1::numeric > 0 AS value`,
      [aggregate.completed_amount]
    )).rows[0]?.value === true;

    const requiresFullRefund = vendNeedsFullRefund(aggregate.vend_status);
    const parentRefundStatus = aggregate.has_open
      ? (aggregate.has_unknown ? "UNKNOWN" : "PENDING")
      : fullyRefunded
        ? "COMPLETED"
        : aggregate.has_failed
          ? "FAILED"
          : completedPositive
            ? "PARTIAL"
            : status;

    const refundRequired = !fullyRefunded &&
      (requiresFullRefund || Boolean(aggregate.has_open || aggregate.has_failed));

    const normalizedStatus = fullyRefunded
      ? "REFUNDED"
      : refundRequired
        ? "REFUND_PENDING"
        : aggregate.vend_status === "FULFILLED"
          ? "FULFILLED"
          : null;

    const settlementBlocked = !fullyRefunded &&
      (requiresFullRefund || Boolean(aggregate.has_open || aggregate.has_unknown));

    const holdReason = fullyRefunded
      ? null
      : aggregate.has_unknown
        ? "REFUND_OUTCOME_UNKNOWN"
        : refundRequired
          ? "REFUND_REQUIRED"
          : settlementBlocked
            ? "REFUND_PENDING"
            : null;

    await client.query(
      `UPDATE transactions
          SET refund_status = $2,
              normalized_status = COALESCE($3, normalized_status),
              refund_required = $4,
              settlement_blocked = $5,
              financial_hold_reason = $6,
              updated_at = now()
        WHERE id = $1`,
      [
        transactionId,
        parentRefundStatus,
        normalizedStatus,
        refundRequired,
        settlementBlocked,
        holdReason
      ]
    );

    await client.query(
      `INSERT INTO audit_logs (
         tenant_id, actor_user_id, action, resource_type, resource_id, after_state
       ) VALUES ($1,$2,'refund.provider_result','refund',$3,$4::jsonb)`,
      [
        principal.tenantId,
        principal.userId,
        refundId,
        JSON.stringify({
          transactionId,
          status,
          parentRefundStatus,
          completedAmount: aggregate.completed_amount,
          fullyRefunded,
          refundRequired,
          settlementBlocked,
          ...(result.response?.providerRefundId
            ? { providerRefundId: result.response.providerRefundId }
            : {}),
          ...(result.error ? { error: result.error } : {})
        })
      ]
    );
  });
}

export async function listRefunds(principal: Principal, limit: number) {
  return withTenantContext(dbContext(principal), async (client) =>
    (await client.query(
      `SELECT * FROM refunds ORDER BY requested_at DESC LIMIT $1`,
      [limit]
    )).rows
  );
}

export async function upsertSettlements(
  principal: Principal,
  providerId: string,
  connectorId: string,
  settlements: ProviderSettlement[]
): Promise<number> {
  return withTenantContext(dbContext(principal), async (client) => {
    for (const settlement of settlements) {
      await client.query(
        `INSERT INTO provider_settlements (
           tenant_id, provider_id, connector_id, provider_settlement_id,
           currency, gross_amount, net_amount, provider_status,
           period_start, period_end
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (connector_id, provider_settlement_id)
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

export async function listSettlements(principal: Principal, limit: number) {
  return withTenantContext(dbContext(principal), async (client) =>
    (await client.query(
      `SELECT * FROM provider_settlements ORDER BY period_end DESC LIMIT $1`,
      [limit]
    )).rows
  );
}

export async function runReconciliation(
  principal: Principal,
  graceMinutes: number
): Promise<{ created: number }> {
  return withTenantContext(dbContext(principal), async (client) => {
    const paidNotFulfilled = await client.query(
      `INSERT INTO reconciliation_exceptions (
         tenant_id, transaction_id, provider_id, exception_type,
         severity, amount, currency, details
       )
       SELECT
         t.tenant_id, t.id, t.provider_id, 'PAID_NOT_FULFILLED',
         CASE WHEN now() - t.created_at > interval '24 hours' THEN 'CRITICAL' ELSE 'HIGH' END,
         t.total_amount, t.currency,
         jsonb_build_object('paymentStatus', t.payment_status, 'vendStatus', t.vend_status)
       FROM transactions t
       WHERE t.payment_status = 'SUCCESS'
         AND t.vend_status <> 'FULFILLED'
         AND t.normalized_status <> 'REFUNDED'
         AND t.created_at < now() - make_interval(mins => $1)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [graceMinutes]
    );

    const refundOutstanding = await client.query(
      `INSERT INTO reconciliation_exceptions (
         tenant_id, transaction_id, provider_id, exception_type,
         severity, amount, currency, details
       )
       SELECT
         t.tenant_id, t.id, t.provider_id, 'REFUND_PENDING_TOO_LONG',
         'HIGH', t.total_amount, t.currency,
         jsonb_build_object('refundStatus', t.refund_status)
       FROM transactions t
       WHERE t.refund_required = true
         AND (t.refund_status IS NULL OR t.refund_status IN ('PENDING','UNKNOWN','REQUESTED','PARTIAL','FAILED'))
         AND t.updated_at < now() - interval '24 hours'
       ON CONFLICT DO NOTHING
       RETURNING id`
    );

    const fulfilledNotSettled = await client.query(
      `INSERT INTO reconciliation_exceptions (
         tenant_id, transaction_id, provider_id, exception_type,
         severity, amount, currency, details
       )
       SELECT
         t.tenant_id, t.id, t.provider_id, 'FULFILLED_NOT_SETTLED',
         'MEDIUM', t.total_amount, t.currency,
         jsonb_build_object('settlementStatus', t.settlement_status)
       FROM transactions t
       WHERE t.vend_status = 'FULFILLED'
         AND t.normalized_status <> 'REFUNDED'
         AND t.settlement_blocked = false
         AND COALESCE(t.settlement_status, '') <> 'SETTLED'
         AND t.updated_at < now() - interval '24 hours'
       ON CONFLICT DO NOTHING
       RETURNING id`
    );

    const created = (paidNotFulfilled.rowCount ?? 0) +
      (refundOutstanding.rowCount ?? 0) +
      (fulfilledNotSettled.rowCount ?? 0);

    await client.query(
      `INSERT INTO audit_logs (
         tenant_id, actor_user_id, action, resource_type, after_state
       ) VALUES ($1,$2,'reconciliation.run','reconciliation',$3::jsonb)`,
      [
        principal.tenantId,
        principal.userId,
        JSON.stringify({ graceMinutes, created })
      ]
    );

    return { created };
  });
}

export async function listReconciliationExceptions(
  principal: Principal,
  limit: number
) {
  return withTenantContext(dbContext(principal), async (client) =>
    (await client.query(
      `SELECT *
       FROM reconciliation_exceptions
       WHERE status <> 'RESOLVED'
       ORDER BY CASE severity
         WHEN 'CRITICAL' THEN 0
         WHEN 'HIGH' THEN 1
         WHEN 'MEDIUM' THEN 2
         ELSE 3
       END, detected_at DESC
       LIMIT $1`,
      [limit]
    )).rows
  );
}
