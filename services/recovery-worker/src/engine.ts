import { randomUUID } from "node:crypto";
import type {
  ConnectorRecord,
  ProviderType,
  TransactionStatus
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
  providerTransactionId: string;
  status: TransactionStatus;
  attempts: number;
  leaseToken: string;
}

interface RefundRecoveryClaim {
  id: string;
  transactionId: string;
  providerId: string;
  connector: ConnectorRecord;
  providerRefundId: string;
  attempts: number;
  leaseToken: string;
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

function leaseSeconds(timeoutMs: number): number {
  return Math.max(180, Math.ceil(timeoutMs / 1000) + 60);
}

function isTerminal(status: TransactionStatus): boolean {
  return ["FULFILLED", "FAILED", "CANCELLED", "REFUNDED", "REVERSED", "SETTLED"].includes(status);
}

async function claimNextTransaction(tenantId: string): Promise<TransactionRecoveryClaim | null> {
  return withTenantContext(context(tenantId), async (client) => {
    const row = (await client.query(
      `SELECT
         t.id,t.provider_id AS "providerId",
         t.provider_transaction_id AS "providerTransactionId",
         t.normalized_status AS status,t.recovery_attempts AS attempts,
         ${runtimeSelect}
       FROM transactions t
       JOIN providers p ON p.id=t.provider_id
       JOIN provider_connectors pc ON pc.id=t.connector_id
       WHERE t.tenant_id=$1
         AND (
           t.normalized_status IN ('UNKNOWN','TIMED_OUT')
           OR (
             t.normalized_status IN ('CREATED','SUBMITTED','ACCEPTED')
             AND t.recovery_attempts > 0
           )
         )
         AND t.provider_transaction_id IS NOT NULL
         AND (t.next_recovery_at IS NULL OR t.next_recovery_at<=now())
         AND (t.recovery_lease_until IS NULL OR t.recovery_lease_until<now())
         AND pc.enabled=true
         AND pc.status IN ('ACTIVE','DEGRADED')
       ORDER BY COALESCE(t.next_recovery_at,t.last_provider_query_at,t.unknown_since,t.updated_at)
       FOR UPDATE OF t SKIP LOCKED
       LIMIT 1`,
      [tenantId]
    )).rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    const token = randomUUID();
    const nextAttempt = Number(row.attempts) + 1;
    const timeout = Number(row.timeoutMs);
    const claimed = await client.query(
      `UPDATE transactions
          SET recovery_lease_until=now()+make_interval(secs=>$3),
              recovery_lease_token=$2,
              recovery_attempts=recovery_attempts+1,
              next_recovery_at=NULL
        WHERE id=$1
        RETURNING id`,
      [String(row.id), token, leaseSeconds(timeout)]
    );
    if (claimed.rowCount !== 1) return null;

    return {
      id: String(row.id),
      providerId: String(row.providerId),
      providerType: row.providerType as ProviderType,
      connector: connectorFromRow(row),
      providerTransactionId: String(row.providerTransactionId),
      status: row.status as TransactionStatus,
      attempts: nextAttempt,
      leaseToken: token
    };
  });
}

function refundRequiredFor(status: TransactionStatus): boolean {
  return status === "FAILED" || status === "CANCELLED";
}

async function applyTransactionResolution(
  tenantId: string,
  claim: TransactionRecoveryClaim,
  resolution: UnknownResolution
): Promise<boolean> {
  return withTenantContext(context(tenantId), async (client) => {
    const terminal = isTerminal(resolution.status);
    const refundRequired = refundRequiredFor(resolution.status);
    const settlementBlocked = resolution.status !== "FULFILLED" && resolution.status !== "SETTLED";
    const holdReason = resolution.status === "FAILED"
      ? "PAID_VEND_FAILED"
      : resolution.status === "CANCELLED"
        ? "PAID_VEND_CANCELLED"
        : resolution.status === "UNKNOWN" || resolution.status === "TIMED_OUT"
          ? "VEND_OUTCOME_UNKNOWN"
          : !terminal
            ? "VEND_IN_PROGRESS"
            : null;

    const updated = await client.query(
      `UPDATE transactions
          SET normalized_status=$3,vend_status=$4,provider_status=$5,
              provider_transaction_id=$6,last_provider_query_at=$7,
              unknown_since=CASE
                WHEN $3 IN ('UNKNOWN','TIMED_OUT') THEN COALESCE(unknown_since,$7)
                WHEN $8::boolean THEN NULL
                ELSE unknown_since
              END,
              refund_required=$9,settlement_blocked=$10,financial_hold_reason=$11,
              recovery_lease_until=NULL,recovery_lease_token=NULL,recovery_last_error=NULL,
              next_recovery_at=CASE WHEN $8::boolean THEN NULL ELSE now()+interval '5 minutes' END,
              completed_at=CASE WHEN $8::boolean THEN COALESCE(completed_at,$7) ELSE completed_at END,
              updated_at=now()
        WHERE id=$1 AND recovery_lease_token=$2
        RETURNING id`,
      [
        claim.id,
        claim.leaseToken,
        resolution.status,
        resolution.vendStatus,
        resolution.providerStatus ?? null,
        resolution.providerTransactionId,
        resolution.queriedAt,
        terminal,
        refundRequired,
        settlementBlocked,
        holdReason
      ]
    );
    if (updated.rowCount !== 1) return false;

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
          terminal,
          recoveryAttempt: claim.attempts
        }),
        resolution.queriedAt
      ]
    );
    await client.query(
      `INSERT INTO audit_logs(
         tenant_id,action,resource_type,resource_id,after_state
       ) VALUES($1,'recovery.transaction.query','transaction',$2,$3::jsonb)`,
      [tenantId, claim.id, JSON.stringify({ status: resolution.status, terminal, attempt: claim.attempts })]
    );
    return true;
  });
}

async function recordTransactionRecoveryFailure(
  tenantId: string,
  claim: TransactionRecoveryClaim,
  error: unknown
): Promise<boolean> {
  const message = error instanceof Error ? error.message : "UNKNOWN_RECOVERY_ERROR";
  const backoffMinutes = Math.min(60, Math.max(2, 2 ** Math.min(claim.attempts, 5)));
  return withTenantContext(context(tenantId), async (client) => {
    const updated = await client.query(
      `UPDATE transactions
          SET recovery_lease_until=NULL,recovery_lease_token=NULL,recovery_last_error=$3,
              next_recovery_at=now()+make_interval(mins=>$4),updated_at=now()
        WHERE id=$1 AND recovery_lease_token=$2
        RETURNING id`,
      [claim.id, claim.leaseToken, message, backoffMinutes]
    );
    if (updated.rowCount !== 1) return false;
    await client.query(
      `INSERT INTO audit_logs(
         tenant_id,action,resource_type,resource_id,after_state
       ) VALUES($1,'recovery.transaction.failed','transaction',$2,$3::jsonb)`,
      [tenantId, claim.id, JSON.stringify({ error: message, attempt: claim.attempts, backoffMinutes })]
    );
    return true;
  });
}

async function claimNextRefund(tenantId: string): Promise<RefundRecoveryClaim | null> {
  return withTenantContext(context(tenantId), async (client) => {
    const row = (await client.query(
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
       ORDER BY COALESCE(r.next_recovery_at,r.updated_at)
       FOR UPDATE OF r SKIP LOCKED
       LIMIT 1`,
      [tenantId]
    )).rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    const token = randomUUID();
    const nextAttempt = Number(row.attempts) + 1;
    const timeout = Number(row.timeoutMs);
    const claimed = await client.query(
      `UPDATE refunds
          SET recovery_lease_until=now()+make_interval(secs=>$3),
              recovery_lease_token=$2,
              recovery_attempts=recovery_attempts+1,
              next_recovery_at=NULL
        WHERE id=$1
        RETURNING id`,
      [String(row.id), token, leaseSeconds(timeout)]
    );
    if (claimed.rowCount !== 1) return null;

    return {
      id: String(row.id),
      transactionId: String(row.transactionId),
      providerId: String(row.providerId),
      connector: connectorFromRow(row),
      providerRefundId: String(row.providerRefundId),
      attempts: nextAttempt,
      leaseToken: token
    };
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
): Promise<"RESOLVED" | "PENDING" | "STALE"> {
  const result = await queryRefundStatusSafely(
    claim.connector,
    secrets,
    claim.providerRefundId
  );

  if (result.outcome === "UNKNOWN") throw new Error(result.error);

  const applied = await withTenantContext(context(tenantId), async (client) => {
    if (result.outcome === "FAILED") {
      const updated = await client.query(
        `UPDATE refunds
            SET status='FAILED',recovery_lease_until=NULL,recovery_lease_token=NULL,
                recovery_last_error=NULL,next_recovery_at=NULL,updated_at=now()
          WHERE id=$1 AND recovery_lease_token=$2
          RETURNING id`,
        [claim.id, claim.leaseToken]
      );
      return updated.rowCount === 1;
    }

    const pending = result.response.status === "PENDING";
    const updated = await client.query(
      `UPDATE refunds
          SET status=$3,provider_refund_id=$4,provider_status=$5,
              recovery_lease_until=NULL,recovery_lease_token=NULL,recovery_last_error=NULL,
              next_recovery_at=CASE WHEN $3='PENDING' THEN now()+interval '5 minutes' ELSE NULL END,
              completed_at=CASE WHEN $3='COMPLETED' THEN COALESCE(completed_at,now()) ELSE completed_at END,
              updated_at=now()
        WHERE id=$1 AND recovery_lease_token=$2
        RETURNING id`,
      [
        claim.id,
        claim.leaseToken,
        result.response.status,
        claim.providerRefundId,
        result.response.providerStatus ?? null
      ]
    );
    if (updated.rowCount !== 1) return false;

    await client.query(
      `INSERT INTO audit_logs(
         tenant_id,action,resource_type,resource_id,after_state
       ) VALUES($1,'recovery.refund.query','refund',$2,$3::jsonb)`,
      [
        tenantId,
        claim.id,
        JSON.stringify({
          outcome: result.outcome,
          status: result.response.status,
          attempt: claim.attempts
        })
      ]
    );
    return true;
  });

  if (!applied) return "STALE";
  await recalculateRefundParent(tenantId, claim.transactionId);
  return result.outcome === "CONFIRMED" && result.response.status === "PENDING"
    ? "PENDING"
    : "RESOLVED";
}

async function recordRefundRecoveryFailure(
  tenantId: string,
  claim: RefundRecoveryClaim,
  error: unknown
): Promise<boolean> {
  const message = error instanceof Error ? error.message : "UNKNOWN_RECOVERY_ERROR";
  const backoffMinutes = Math.min(60, Math.max(2, 2 ** Math.min(claim.attempts, 5)));
  return withTenantContext(context(tenantId), async (client) => {
    const updated = await client.query(
      `UPDATE refunds
          SET status='UNKNOWN',recovery_lease_until=NULL,recovery_lease_token=NULL,
              recovery_last_error=$3,next_recovery_at=now()+make_interval(mins=>$4),updated_at=now()
        WHERE id=$1 AND recovery_lease_token=$2
        RETURNING id`,
      [claim.id, claim.leaseToken, message, backoffMinutes]
    );
    if (updated.rowCount !== 1) return false;
    await client.query(
      `INSERT INTO audit_logs(
         tenant_id,action,resource_type,resource_id,after_state
       ) VALUES($1,'recovery.refund.failed','refund',$2,$3::jsonb)`,
      [tenantId, claim.id, JSON.stringify({ error: message, attempt: claim.attempts, backoffMinutes })]
    );
    return true;
  });
}

export async function runTenantRecoveryCycle(
  tenantId: string,
  limit = 25
): Promise<RecoveryCycleResult> {
  const boundedLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
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

  for (let index = 0; index < boundedLimit; index += 1) {
    const claim = await claimNextTransaction(tenantId);
    if (!claim) break;
    result.transactionsClaimed += 1;
    try {
      const resolution = await resolveUnknownTransaction(claim, secrets);
      const applied = await applyTransactionResolution(tenantId, claim, resolution);
      if (applied && isTerminal(resolution.status)) result.transactionsResolved += 1;
    } catch (error) {
      if (await recordTransactionRecoveryFailure(tenantId, claim, error)) {
        result.transactionFailures += 1;
      }
    }
  }

  for (let index = 0; index < boundedLimit; index += 1) {
    const claim = await claimNextRefund(tenantId);
    if (!claim) break;
    result.refundsClaimed += 1;
    try {
      const status = await applyRefundRecoveryResult(tenantId, claim);
      if (status === "RESOLVED") result.refundsResolved += 1;
    } catch (error) {
      if (await recordRefundRecoveryFailure(tenantId, claim, error)) {
        result.refundFailures += 1;
      }
    }
  }

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
