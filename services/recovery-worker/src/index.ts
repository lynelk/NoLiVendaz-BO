import type {
  ConnectorRecord,
  ProviderType,
  TransactionStatus,
  VendStatus
} from "@nolivendaz/canonical-models";
import { pool, withTenantContext } from "@nolivendaz/database";
import {
  queryRefundStatusSafely,
  resolveUnknownTransaction,
  type UnknownResolution
} from "@nolivendaz/provider-orchestrator";
import { EnvironmentSecretResolver } from "@nolivendaz/provider-sdk";

const secrets = new EnvironmentSecretResolver();
const context = (tenantId: string) => ({ tenantId, isPlatformAdmin: false });

function connectorFromRow(row: Record<string, unknown>): ConnectorRecord {
  return {
    id: String(row.connectorId),
    providerId: String(row.providerId),
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

interface TransactionRecoveryClaim {
  id: string;
  providerId: string;
  providerType: ProviderType;
  connector: ConnectorRecord;
  providerTransactionId: string | null;
  status: TransactionStatus;
  attempts: number;
}

interface RefundRecoveryClaim {
  id: string;
  transactionId: string;
  providerId: string;
  connector: ConnectorRecord;
  providerRefundId: string;
  attempts: number;
}

export interface RecoveryCycleResult {
  tenantId: string;
  transactionsClaimed: number;
  transactionsResolved: number;
  transactionFailures: number;
  refundsClaimed: number;
  refundsResolved: number;
  refundFailures: number;
  casesEscalated: number;
}

async function claimUnknownTransactions(
  tenantId: string,
  limit: number
): Promise<TransactionRecoveryClaim[]> {
  return withTenantContext(context(tenantId), async (client) => {
    const result = await client.query(
      `SELECT
         t.id,t.provider_id AS "providerId",
         t.provider_transaction_id AS "providerTransactionId",
         t.normalized_status AS status,t.recovery_attempts AS attempts,
         ${runtimeSelect}
       FROM transactions t
       JOIN providers p ON p.id=t.provider_id
       JOIN provider_connectors pc ON pc.id=t.connector_id
       WHERE t.tenant_id=$1
         AND t.normalized_status IN ('UNKNOWN','TIMED_OUT')
         AND t.provider_transaction_id IS NOT NULL
         AND (t.next_recovery_at IS NULL OR t.next_recovery_at<=now())
         AND (t.recovery_lease_until IS NULL OR t.recovery_lease_until<now())
         AND pc.enabled=true
         AND pc.status IN ('ACTIVE','DEGRADED')
       ORDER BY COALESCE(t.last_provider_query_at,t.unknown_since,t.updated_at)
       FOR UPDATE OF t SKIP LOCKED
       LIMIT $2`,
      [tenantId, limit]
    );

    const ids = result.rows.map((row) => String(row.id));
    if (ids.length > 0) {
      await client.query(
        `UPDATE transactions
            SET recovery_lease_until=now()+interval '90 seconds',
                recovery_attempts=recovery_attempts+1,
                next_recovery_at=now()+interval '5 minutes'
          WHERE id=ANY($1::uuid[])`,
        [ids]
      );
    }

    return result.rows.map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        id: String(row.id),
        providerId: String(row.providerId),
        providerType: row.providerType as ProviderType,
        connector: connectorFromRow(row),
        providerTransactionId: row.providerTransactionId as string | null,
        status: row.status as TransactionStatus,
        attempts: Number(row.attempts) + 1
      };
    });
  });
}

function refundRequiredFor(status: TransactionStatus): boolean {
  return status === "FAILED" || status === "CANCELLED";
}

async function applyTransactionResolution(
  tenantId: string,
  claim: TransactionRecoveryClaim,
  resolution: UnknownResolution
): Promise<void> {
  await withTenantContext(context(tenantId), async (client) => {
    const refundRequired = refundRequiredFor(resolution.status);
    const settlementBlocked = resolution.status !== "FULFILLED";
    const holdReason = resolution.status === "FAILED"
      ? "PAID_VEND_FAILED"
      : resolution.status === "CANCELLED"
        ? "PAID_VEND_CANCELLED"
        : resolution.status === "UNKNOWN" || resolution.status === "TIMED_OUT"
          ? "VEND_OUTCOME_UNKNOWN"
          : resolution.status !== "FULFILLED"
            ? "VEND_IN_PROGRESS"
            : null;

    await client.query(
      `UPDATE transactions
          SET normalized_status=$2,vend_status=$3,provider_status=$4,
              provider_transaction_id=$5,last_provider_query_at=$6,
              unknown_since=CASE WHEN $2 IN ('UNKNOWN','TIMED_OUT')
                THEN COALESCE(unknown_since,$6) ELSE NULL END,
              refund_required=$7,settlement_blocked=$8,financial_hold_reason=$9,
              recovery_lease_until=NULL,recovery_last_error=NULL,
              next_recovery_at=CASE WHEN $2 IN ('UNKNOWN','TIMED_OUT')
                THEN now()+interval '5 minutes' ELSE NULL END,
              completed_at=CASE WHEN $2 IN ('FULFILLED','FAILED','CANCELLED')
                THEN COALESCE(completed_at,$6) ELSE completed_at END,
              updated_at=now()
        WHERE id=$1`,
      [
        claim.id,
        resolution.status,
        resolution.vendStatus,
        resolution.providerStatus ?? null,
        resolution.providerTransactionId,
        resolution.queriedAt,
        refundRequired,
        settlementBlocked,
        holdReason
      ]
    );

    await client.query(
      `INSERT INTO transaction_events(
         tenant_id,transaction_id,event_type,normalized_status,provider_status,
         payload,source,occurred_at
       ) VALUES($1,$2,'recovery.provider_query',$3,$4,$5::jsonb,'recovery-worker',$6)`,
      [
        tenantId,
        claim.id,
        resolution.status,
        resolution.providerStatus ?? null,
        JSON.stringify({
          providerTransactionId: resolution.providerTransactionId,
          vendStatus: resolution.vendStatus,
          refundRequired,
          settlementBlocked,
          recoveryAttempt: claim.attempts
        }),
        resolution.queriedAt
      ]
    );
    await client.query(
      `INSERT INTO audit_logs(
         tenant_id,action,resource_type,resource_id,after_state
       ) VALUES($1,'recovery.transaction.query','transaction',$2,$3::jsonb)`,
      [tenantId, claim.id, JSON.stringify({ status: resolution.status, attempt: claim.attempts })]
    );
  });
}

async function recordTransactionRecoveryFailure(
  tenantId: string,
  claim: TransactionRecoveryClaim,
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : "UNKNOWN_RECOVERY_ERROR";
  const backoffMinutes = Math.min(60, Math.max(2, 2 ** Math.min(claim.attempts, 5)));
  await withTenantContext(context(tenantId), async (client) => {
    await client.query(
      `UPDATE transactions
          SET recovery_lease_until=NULL,recovery_last_error=$2,
              next_recovery_at=now()+make_interval(mins=>$3),updated_at=now()
        WHERE id=$1`,
      [claim.id, message, backoffMinutes]
    );
    await client.query(
      `INSERT INTO audit_logs(
         tenant_id,action,resource_type,resource_id,after_state
       ) VALUES($1,'recovery.transaction.failed','transaction',$2,$3::jsonb)`,
      [tenantId, claim.id, JSON.stringify({ error: message, attempt: claim.attempts, backoffMinutes })]
    );
  });
}

async function claimRefunds(
  tenantId: string,
  limit: number
): Promise<RefundRecoveryClaim[]> {
  return withTenantContext(context(tenantId), async (client) => {
    const result = await client.query(
      `SELECT
         r.id,r.transaction_id AS "transactionId",r.provider_id AS "providerId",
         r.provider_refund_id AS "providerRefundId",r.recovery_attempts AS attempts,
         ${runtimeSelect}
       FROM refunds r
       JOIN providers p ON p.id=r.provider_id
       JOIN provider_connectors pc ON pc.id=r.connector_id
       WHERE r.tenant_id=$1
         AND r.status IN ('PENDING','UNKNOWN')
         AND r.provider_refund_id IS NOT NULL
         AND (r.next_recovery_at IS NULL OR r.next_recovery_at<=now())
         AND (r.recovery_lease_until IS NULL OR r.recovery_lease_until<now())
         AND pc.enabled=true
         AND pc.status IN ('ACTIVE','DEGRADED')
         AND EXISTS (
           SELECT 1 FROM connector_capabilities cc
           JOIN capabilities c ON c.id=cc.capability_id
           WHERE cc.connector_id=pc.id AND cc.enabled=true AND c.code='refund.status'
         )
       ORDER BY r.updated_at
       FOR UPDATE OF r SKIP LOCKED
       LIMIT $2`,
      [tenantId, limit]
    );

    const ids = result.rows.map((row) => String(row.id));
    if (ids.length > 0) {
      await client.query(
        `UPDATE refunds
            SET recovery_lease_until=now()+interval '90 seconds',
                recovery_attempts=recovery_attempts+1,
                next_recovery_at=now()+interval '5 minutes'
          WHERE id=ANY($1::uuid[])`,
        [ids]
      );
    }

    return result.rows.map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        id: String(row.id),
        transactionId: String(row.transactionId),
        providerId: String(row.providerId),
        connector: connectorFromRow(row),
        providerRefundId: String(row.providerRefundId),
        attempts: Number(row.attempts) + 1
      };
    });
  });
}

async function recalculateRefundParent(tenantId: string, transactionId: string): Promise<void> {
  await withTenantContext(context(tenantId), async (client) => {
    const aggregate = (await client.query(
      `SELECT
         t.total_amount,t.vend_status,
         COALESCE(SUM(r.amount) FILTER (WHERE r.status='COMPLETED'),0) >= t.total_amount AS fully_refunded,
         COALESCE(SUM(r.amount) FILTER (WHERE r.status='COMPLETED'),0) > 0 AS has_completed,
         COALESCE(BOOL_OR(r.status IN ('REQUESTED','APPROVED','PENDING','UNKNOWN')),false) AS has_open,
         COALESCE(BOOL_OR(r.status='UNKNOWN'),false) AS has_unknown,
         COALESCE(BOOL_OR(r.status='FAILED'),false) AS has_failed
       FROM transactions t
       LEFT JOIN refunds r ON r.transaction_id=t.id
       WHERE t.id=$1
       GROUP BY t.id,t.total_amount,t.vend_status`,
      [transactionId]
    )).rows[0];
    if (!aggregate) return;

    const requiresFullRefund = aggregate.vend_status === "FAILED" || aggregate.vend_status === "CANCELLED";
    const fullyRefunded = aggregate.fully_refunded === true;
    const refundRequired = !fullyRefunded &&
      (requiresFullRefund || Boolean(aggregate.has_open || aggregate.has_failed));
    const parentRefundStatus = aggregate.has_open
      ? (aggregate.has_unknown ? "UNKNOWN" : "PENDING")
      : fullyRefunded
        ? "COMPLETED"
        : aggregate.has_failed
          ? "FAILED"
          : aggregate.has_completed
            ? "PARTIAL"
            : null;
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
          : null;

    await client.query(
      `UPDATE transactions
          SET refund_status=$2,normalized_status=COALESCE($3,normalized_status),
              refund_required=$4,settlement_blocked=$5,financial_hold_reason=$6,
              updated_at=now()
        WHERE id=$1`,
      [transactionId, parentRefundStatus, normalizedStatus, refundRequired, settlementBlocked, holdReason]
    );
  });
}

async function applyRefundRecoveryResult(
  tenantId: string,
  claim: RefundRecoveryClaim
): Promise<"RESOLVED" | "PENDING"> {
  const result = await queryRefundStatusSafely(
    claim.connector,
    secrets,
    claim.providerRefundId
  );

  if (result.outcome === "UNKNOWN") {
    throw new Error(result.error);
  }

  await withTenantContext(context(tenantId), async (client) => {
    if (result.outcome === "FAILED") {
      await client.query(
        `UPDATE refunds
            SET status='FAILED',recovery_lease_until=NULL,recovery_last_error=$2,
                next_recovery_at=NULL,updated_at=now()
          WHERE id=$1`,
        [claim.id, result.error]
      );
    } else {
      const nextRecovery = result.response.status === "PENDING";
      await client.query(
        `UPDATE refunds
            SET status=$2,provider_refund_id=$3,provider_status=$4,
                recovery_lease_until=NULL,recovery_last_error=NULL,
                next_recovery_at=CASE WHEN $2='PENDING'
                  THEN now()+interval '5 minutes' ELSE NULL END,
                completed_at=CASE WHEN $2='COMPLETED'
                  THEN COALESCE(completed_at,now()) ELSE completed_at END,
                updated_at=now()
          WHERE id=$1`,
        [
          claim.id,
          result.response.status,
          result.response.providerRefundId,
          result.response.providerStatus ?? null
        ]
      );
      if (nextRecovery) return;
    }

    await client.query(
      `INSERT INTO audit_logs(
         tenant_id,action,resource_type,resource_id,after_state
       ) VALUES($1,'recovery.refund.query','refund',$2,$3::jsonb)`,
      [
        tenantId,
        claim.id,
        JSON.stringify({
          outcome: result.outcome,
          status: result.outcome === "CONFIRMED" ? result.response.status : "FAILED",
          attempt: claim.attempts
        })
      ]
    );
  });

  await recalculateRefundParent(tenantId, claim.transactionId);
  return result.outcome === "CONFIRMED" && result.response.status === "PENDING"
    ? "PENDING"
    : "RESOLVED";
}

async function recordRefundRecoveryFailure(
  tenantId: string,
  claim: RefundRecoveryClaim,
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : "UNKNOWN_RECOVERY_ERROR";
  const backoffMinutes = Math.min(60, Math.max(2, 2 ** Math.min(claim.attempts, 5)));
  await withTenantContext(context(tenantId), async (client) => {
    await client.query(
      `UPDATE refunds
          SET status='UNKNOWN',recovery_lease_until=NULL,recovery_last_error=$2,
              next_recovery_at=now()+make_interval(mins=>$3),updated_at=now()
        WHERE id=$1`,
      [claim.id, message, backoffMinutes]
    );
    await client.query(
      `INSERT INTO audit_logs(
         tenant_id,action,resource_type,resource_id,after_state
       ) VALUES($1,'recovery.refund.failed','refund',$2,$3::jsonb)`,
      [tenantId, claim.id, JSON.stringify({ error: message, attempt: claim.attempts, backoffMinutes })]
    );
  });
}

async function escalateCases(tenantId: string): Promise<number> {
  return withTenantContext(context(tenantId), async (client) => {
    const unknowns = await client.query(
      `INSERT INTO support_cases(
         tenant_id,case_number,source,source_key,category,priority,status,title,
         description,transaction_id,provider_id,connector_id,metadata
       )
       SELECT
         t.tenant_id,'SC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),
         'RECOVERY','transaction-unknown:' || t.id,'TRANSACTION_UNKNOWN',
         CASE WHEN t.recovery_attempts>=5 THEN 'CRITICAL' ELSE 'HIGH' END,
         'OPEN','Unknown vending outcome requires investigation',
         CASE WHEN t.provider_transaction_id IS NULL
           THEN 'Provider transaction reference is unavailable; automatic query is unsafe.'
           ELSE 'Automated provider queries have not resolved the vending outcome.' END,
         t.id,t.provider_id,t.connector_id,
         jsonb_build_object('recoveryAttempts',t.recovery_attempts,'lastError',t.recovery_last_error)
       FROM transactions t
       WHERE t.tenant_id=$1
         AND t.normalized_status IN ('UNKNOWN','TIMED_OUT')
         AND (
           (t.provider_transaction_id IS NULL AND COALESCE(t.unknown_since,t.updated_at)<now()-interval '10 minutes')
           OR t.recovery_attempts>=5
         )
       ON CONFLICT (tenant_id,source_key) WHERE source_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [tenantId]
    );

    const refunds = await client.query(
      `INSERT INTO support_cases(
         tenant_id,case_number,source,source_key,category,priority,status,title,
         description,transaction_id,provider_id,connector_id,refund_id,metadata
       )
       SELECT
         r.tenant_id,'SC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),
         'RECOVERY','refund-unknown:' || r.id,'REFUND',
         CASE WHEN r.recovery_attempts>=5 THEN 'CRITICAL' ELSE 'HIGH' END,
         'OPEN','Refund recovery requires investigation',
         CASE WHEN r.provider_refund_id IS NULL
           THEN 'Provider refund reference is unavailable; automatic status query is unsafe.'
           ELSE 'Automated refund status queries have not resolved the outcome.' END,
         r.transaction_id,r.provider_id,r.connector_id,r.id,
         jsonb_build_object('recoveryAttempts',r.recovery_attempts,'lastError',r.recovery_last_error)
       FROM refunds r
       WHERE r.tenant_id=$1
         AND r.status IN ('PENDING','UNKNOWN')
         AND r.updated_at<now()-interval '30 minutes'
         AND (r.provider_refund_id IS NULL OR r.recovery_attempts>=5)
       ON CONFLICT (tenant_id,source_key) WHERE source_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [tenantId]
    );

    return (unknowns.rowCount ?? 0) + (refunds.rowCount ?? 0);
  });
}

export async function runTenantRecoveryCycle(
  tenantId: string,
  limit = 25
): Promise<RecoveryCycleResult> {
  const result: RecoveryCycleResult = {
    tenantId,
    transactionsClaimed: 0,
    transactionsResolved: 0,
    transactionFailures: 0,
    refundsClaimed: 0,
    refundsResolved: 0,
    refundFailures: 0,
    casesEscalated: 0
  };

  const transactions = await claimUnknownTransactions(tenantId, limit);
  result.transactionsClaimed = transactions.length;
  for (const claim of transactions) {
    try {
      const resolution = await resolveUnknownTransaction(claim, secrets);
      await applyTransactionResolution(tenantId, claim, resolution);
      result.transactionsResolved += 1;
    } catch (error) {
      await recordTransactionRecoveryFailure(tenantId, claim, error);
      result.transactionFailures += 1;
    }
  }

  const refunds = await claimRefunds(tenantId, limit);
  result.refundsClaimed = refunds.length;
  for (const claim of refunds) {
    try {
      const status = await applyRefundRecoveryResult(tenantId, claim);
      if (status === "RESOLVED") result.refundsResolved += 1;
    } catch (error) {
      await recordRefundRecoveryFailure(tenantId, claim, error);
      result.refundFailures += 1;
    }
  }

  result.casesEscalated = await escalateCases(tenantId);
  return result;
}

export async function runAllTenantRecoveryCycles(limitPerTenant = 25) {
  const tenants = await pool.query<{id:string}>(
    `SELECT id FROM tenants WHERE status='ACTIVE' ORDER BY created_at`
  );
  const results: RecoveryCycleResult[] = [];
  for (const tenant of tenants.rows) {
    results.push(await runTenantRecoveryCycle(tenant.id, limitPerTenant));
  }
  return results;
}
