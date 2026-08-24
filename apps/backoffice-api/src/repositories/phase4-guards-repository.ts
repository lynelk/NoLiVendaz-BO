import type { Principal } from "@nolivendaz/canonical-models";
import { withTenantContext } from "@nolivendaz/database";

const context = (principal: Principal) => ({
  tenantId: principal.tenantId,
  isPlatformAdmin: principal.isPlatformAdmin,
  userId: principal.userId
});

export async function validateSupportCaseLinks(
  principal: Principal,
  input: {
    transactionId?: string;
    providerId?: string;
    connectorId?: string;
    refundId?: string;
    reconciliationExceptionId?: string;
  }
): Promise<void> {
  await withTenantContext(context(principal), async (client) => {
    if (input.transactionId) {
      const row = await client.query(
        `SELECT provider_id,connector_id FROM transactions
          WHERE id=$1 AND tenant_id=$2`,
        [input.transactionId, principal.tenantId]
      );
      if (row.rowCount !== 1) throw new Error("TRANSACTION_NOT_FOUND");
      const tx = row.rows[0];
      if (input.providerId && String(tx.provider_id) !== input.providerId) {
        throw new Error("SUPPORT_PROVIDER_TRANSACTION_MISMATCH");
      }
      if (input.connectorId && String(tx.connector_id) !== input.connectorId) {
        throw new Error("SUPPORT_CONNECTOR_TRANSACTION_MISMATCH");
      }
    }

    if (input.providerId) {
      const row = await client.query(
        `SELECT 1 FROM providers
          WHERE id=$1 AND (scope='PLATFORM' OR tenant_id=$2)`,
        [input.providerId, principal.tenantId]
      );
      if (row.rowCount !== 1) throw new Error("SUPPORT_PROVIDER_NOT_ACCESSIBLE");
    }

    if (input.connectorId) {
      const row = await client.query(
        `SELECT pc.provider_id FROM provider_connectors pc
         JOIN providers p ON p.id=pc.provider_id
         WHERE pc.id=$1 AND (p.scope='PLATFORM' OR p.tenant_id=$2)`,
        [input.connectorId, principal.tenantId]
      );
      if (row.rowCount !== 1) throw new Error("SUPPORT_CONNECTOR_NOT_ACCESSIBLE");
      if (input.providerId && String(row.rows[0]?.provider_id) !== input.providerId) {
        throw new Error("SUPPORT_CONNECTOR_PROVIDER_MISMATCH");
      }
    }

    if (input.refundId) {
      const row = await client.query(
        `SELECT transaction_id FROM refunds WHERE id=$1 AND tenant_id=$2`,
        [input.refundId, principal.tenantId]
      );
      if (row.rowCount !== 1) throw new Error("SUPPORT_REFUND_NOT_FOUND");
      if (input.transactionId && String(row.rows[0]?.transaction_id) !== input.transactionId) {
        throw new Error("SUPPORT_REFUND_TRANSACTION_MISMATCH");
      }
    }

    if (input.reconciliationExceptionId) {
      const row = await client.query(
        `SELECT transaction_id FROM reconciliation_exceptions
          WHERE id=$1 AND tenant_id=$2`,
        [input.reconciliationExceptionId, principal.tenantId]
      );
      if (row.rowCount !== 1) throw new Error("SUPPORT_RECONCILIATION_EXCEPTION_NOT_FOUND");
      if (input.transactionId &&
          row.rows[0]?.transaction_id &&
          String(row.rows[0].transaction_id) !== input.transactionId) {
        throw new Error("SUPPORT_RECONCILIATION_TRANSACTION_MISMATCH");
      }
    }
  });
}

export async function validateSupportAssignee(
  principal: Principal,
  userId: string | null | undefined
): Promise<void> {
  if (!userId) return;
  await withTenantContext(context(principal), async (client) => {
    const row = await client.query(
      `SELECT 1 FROM users WHERE id=$1 AND tenant_id=$2 AND status='ACTIVE'`,
      [userId, principal.tenantId]
    );
    if (row.rowCount !== 1) throw new Error("SUPPORT_ASSIGNEE_NOT_ACTIVE_IN_TENANT");
  });
}

export async function failCertificationRun(
  principal: Principal,
  runId: string,
  errorMessage: string
): Promise<void> {
  await withTenantContext(context(principal), async (client) => {
    const updated = await client.query(
      `UPDATE provider_certification_runs
          SET status='FAILED',completed_at=COALESCE(completed_at,now()),
              summary=summary || jsonb_build_object('executionError',$2)
        WHERE id=$1 AND status='RUNNING'
        RETURNING id`,
      [runId, errorMessage]
    );
    if (updated.rowCount === 1) {
      await client.query(
        `INSERT INTO audit_logs(
           tenant_id,actor_user_id,action,resource_type,resource_id,after_state
         ) VALUES($1,$2,'provider.certification.failed','certification_run',$3,$4::jsonb)`,
        [
          principal.tenantId,
          principal.userId,
          runId,
          JSON.stringify({ status: "FAILED", executionError: errorMessage })
        ]
      );
    }
  });
}

export async function approveCertificationSafely(
  principal: Principal,
  runId: string
) {
  return withTenantContext(context(principal), async (client) => {
    const run = (await client.query(
      `SELECT *,summary->>'configurationHash' AS configuration_hash
         FROM provider_certification_runs
        WHERE id=$1 FOR UPDATE`,
      [runId]
    )).rows[0];
    if (!run) throw new Error("CERTIFICATION_RUN_NOT_FOUND");
    if (run.status !== "PASSED") throw new Error("CERTIFICATION_RUN_NOT_PASSED");
    if (String(run.requested_by) === principal.userId) {
      throw new Error("MAKER_CHECKER_VIOLATION");
    }

    const currentHash = (await client.query<{hash:string|null}>(
      `SELECT app.connector_certification_hash($1::uuid) AS hash`,
      [run.connector_id]
    )).rows[0]?.hash;
    if (!run.configuration_hash || !currentHash || run.configuration_hash !== currentHash) {
      throw new Error("CERTIFICATION_CONFIGURATION_CHANGED_RERUN_REQUIRED");
    }

    const connector = (await client.query(
      `SELECT pc.enabled,pc.status,pc.environment
         FROM provider_connectors pc
        WHERE pc.id=$1`,
      [run.connector_id]
    )).rows[0];
    if (!connector) throw new Error("CERTIFICATION_CONNECTOR_NOT_FOUND");
    if (!connector.enabled || !["ACTIVE","DEGRADED"].includes(String(connector.status))) {
      throw new Error("CERTIFICATION_CONNECTOR_NO_LONGER_OPERATIONAL");
    }
    if (String(connector.environment) === "PRODUCTION") {
      throw new Error("CERTIFICATION_CONNECTOR_BECAME_PRODUCTION");
    }

    const provider = (await client.query(
      `UPDATE providers
          SET status='CERTIFIED',updated_at=now()
        WHERE id=$1 AND status IN ('SANDBOX','CERTIFIED')
        RETURNING id,status`,
      [run.provider_id]
    )).rows[0];
    if (!provider) throw new Error("PROVIDER_MUST_BE_IN_SANDBOX_BEFORE_CERTIFICATION");

    const updated = (await client.query(
      `UPDATE provider_certification_runs
          SET status='CERTIFIED',approved_by=$2,approved_at=now()
        WHERE id=$1 AND status='PASSED'
        RETURNING *`,
      [runId, principal.userId]
    )).rows[0];
    if (!updated) throw new Error("CERTIFICATION_APPROVAL_STATE_CHANGED");

    await client.query(
      `INSERT INTO audit_logs(
         tenant_id,actor_user_id,action,resource_type,resource_id,after_state
       ) VALUES($1,$2,'provider.certification.approve','certification_run',$3,$4::jsonb)`,
      [
        principal.tenantId,
        principal.userId,
        runId,
        JSON.stringify({ certification: updated, provider, configurationHash: currentHash })
      ]
    );
    return updated;
  });
}
