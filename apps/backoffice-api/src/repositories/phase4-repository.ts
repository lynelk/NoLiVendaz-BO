import type {
  ConnectorRecord,
  Principal,
  ProviderType
} from "@nolivendaz/canonical-models";
import { withTenantContext } from "@nolivendaz/database";

const context = (principal: Principal) => ({
  tenantId: principal.tenantId,
  isPlatformAdmin: principal.isPlatformAdmin,
  userId: principal.userId
});

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

export interface SupportCaseCreateInput {
  category: "TRANSACTION_UNKNOWN" | "REFUND" | "SETTLEMENT" | "PROVIDER" | "CUSTOMER" | "OTHER";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description?: string;
  transactionId?: string;
  providerId?: string;
  connectorId?: string;
  refundId?: string;
  reconciliationExceptionId?: string;
  source?: "MANUAL" | "RECOVERY" | "RECONCILIATION" | "SYSTEM";
  sourceKey?: string;
  metadata?: Record<string, unknown>;
}

export async function createSupportCase(
  principal: Principal,
  input: SupportCaseCreateInput
) {
  return withTenantContext(context(principal), async (client) => {
    if (input.transactionId) {
      const owned = await client.query(
        `SELECT 1 FROM transactions WHERE id=$1 AND tenant_id=$2`,
        [input.transactionId, principal.tenantId]
      );
      if (owned.rowCount !== 1) throw new Error("TRANSACTION_NOT_FOUND");
    }

    const existing = input.sourceKey
      ? (await client.query(
          `SELECT * FROM support_cases WHERE tenant_id=$1 AND source_key=$2`,
          [principal.tenantId, input.sourceKey]
        )).rows[0]
      : undefined;
    if (existing) return existing;

    const row = (await client.query(
      `INSERT INTO support_cases (
         tenant_id,case_number,source,source_key,category,priority,status,
         title,description,transaction_id,provider_id,connector_id,refund_id,
         reconciliation_exception_id,opened_by,metadata
       ) VALUES (
         $1,'SC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),
         $2,$3,$4,$5,'OPEN',$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb
       ) RETURNING *`,
      [
        principal.tenantId,
        input.source ?? "MANUAL",
        input.sourceKey ?? null,
        input.category,
        input.priority,
        input.title,
        input.description ?? null,
        input.transactionId ?? null,
        input.providerId ?? null,
        input.connectorId ?? null,
        input.refundId ?? null,
        input.reconciliationExceptionId ?? null,
        principal.userId,
        JSON.stringify(input.metadata ?? {})
      ]
    )).rows[0];
    if (!row) throw new Error("SUPPORT_CASE_INSERT_RETURNED_NO_ROW");

    await client.query(
      `INSERT INTO support_case_events(
         tenant_id,support_case_id,event_type,to_status,note,actor_user_id
       ) VALUES($1,$2,'CASE_OPENED','OPEN',$3,$4)`,
      [principal.tenantId, row.id, input.description ?? null, principal.userId]
    );
    await client.query(
      `INSERT INTO audit_logs(
         tenant_id,actor_user_id,action,resource_type,resource_id,after_state
       ) VALUES($1,$2,'support.case.create','support_case',$3,$4::jsonb)`,
      [principal.tenantId, principal.userId, row.id, JSON.stringify(row)]
    );
    return row;
  });
}

export async function listSupportCases(
  principal: Principal,
  filters: { status?: string; priority?: string; limit: number }
) {
  return withTenantContext(context(principal), async (client) => (
    await client.query(
      `SELECT sc.*,p.name AS provider_name,t.transaction_reference
         FROM support_cases sc
         LEFT JOIN providers p ON p.id=sc.provider_id
         LEFT JOIN transactions t ON t.id=sc.transaction_id
        WHERE ($1::text IS NULL OR sc.status=$1)
          AND ($2::text IS NULL OR sc.priority=$2)
        ORDER BY CASE sc.priority
          WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1
          WHEN 'MEDIUM' THEN 2 ELSE 3 END,
          sc.opened_at DESC
        LIMIT $3`,
      [filters.status ?? null, filters.priority ?? null, filters.limit]
    )
  ).rows);
}

export async function getSupportCase(principal: Principal, caseId: string) {
  return withTenantContext(context(principal), async (client) => {
    const row = (await client.query(
      `SELECT * FROM support_cases WHERE id=$1`,
      [caseId]
    )).rows[0];
    if (!row) throw new Error("SUPPORT_CASE_NOT_FOUND");
    const events = await client.query(
      `SELECT * FROM support_case_events
        WHERE support_case_id=$1 ORDER BY created_at`,
      [caseId]
    );
    return { ...row, events: events.rows };
  });
}

export async function updateSupportCase(
  principal: Principal,
  caseId: string,
  input: {
    status?: "OPEN" | "INVESTIGATING" | "PENDING_PROVIDER" | "PENDING_CUSTOMER" | "RESOLVED" | "CLOSED";
    assignedTo?: string | null;
    note?: string;
  }
) {
  return withTenantContext(context(principal), async (client) => {
    const current = (await client.query(
      `SELECT * FROM support_cases WHERE id=$1 FOR UPDATE`,
      [caseId]
    )).rows[0];
    if (!current) throw new Error("SUPPORT_CASE_NOT_FOUND");

    const nextStatus = input.status ?? String(current.status);
    const assignedTo = input.assignedTo === undefined
      ? current.assigned_to
      : input.assignedTo;
    const row = (await client.query(
      `UPDATE support_cases
          SET status=$2,assigned_to=$3,
              resolved_at=CASE WHEN $2='RESOLVED' THEN COALESCE(resolved_at,now()) ELSE resolved_at END,
              closed_at=CASE WHEN $2='CLOSED' THEN COALESCE(closed_at,now()) ELSE closed_at END,
              updated_at=now()
        WHERE id=$1 RETURNING *`,
      [caseId, nextStatus, assignedTo]
    )).rows[0];

    await client.query(
      `INSERT INTO support_case_events(
         tenant_id,support_case_id,event_type,from_status,to_status,note,actor_user_id
       ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        principal.tenantId,
        caseId,
        input.status ? "STATUS_CHANGED" : "NOTE_ADDED",
        current.status,
        nextStatus,
        input.note ?? null,
        principal.userId
      ]
    );
    await client.query(
      `INSERT INTO audit_logs(
         tenant_id,actor_user_id,action,resource_type,resource_id,before_state,after_state
       ) VALUES($1,$2,'support.case.update','support_case',$3,$4::jsonb,$5::jsonb)`,
      [principal.tenantId, principal.userId, caseId, JSON.stringify(current), JSON.stringify(row)]
    );
    return row;
  });
}

export interface CertificationContext {
  runId: string;
  providerId: string;
  providerStatus: string;
  providerType: ProviderType;
  connector: ConnectorRecord;
  capabilities: string[];
}

export async function startCertificationRun(
  principal: Principal,
  connectorId: string
): Promise<CertificationContext> {
  return withTenantContext(context(principal), async (client) => {
    const row = (await client.query(
      `SELECT
         p.id AS "providerId",p.status AS "providerStatus",
         p.provider_type AS "providerType",
         pc.id AS "connectorId",pc.name AS "connectorName",pc.environment,
         pc.api_version AS "apiVersion",pc.base_url AS "baseUrl",
         pc.auth_type AS "authType",pc.credential_reference AS "credentialReference",
         pc.webhook_secret_reference AS "webhookSecretReference",
         pc.timeout_ms AS "timeoutMs",pc.retry_policy AS "retryPolicy",
         pc.runtime_configuration AS "runtimeConfiguration",
         pc.health_check_path AS "healthCheckPath",pc.status AS "connectorStatus",
         pc.enabled,pc.created_at AS "connectorCreatedAt",pc.updated_at AS "connectorUpdatedAt"
       FROM provider_connectors pc
       JOIN providers p ON p.id=pc.provider_id
       WHERE pc.id=$1`,
      [connectorId]
    )).rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error("CONNECTOR_NOT_FOUND");
    if (row.environment === "PRODUCTION") {
      throw new Error("CERTIFICATION_MUST_RUN_BEFORE_PRODUCTION");
    }

    const capabilities = (await client.query<{code:string}>(
      `SELECT c.code FROM connector_capabilities cc
       JOIN capabilities c ON c.id=cc.capability_id
       WHERE cc.connector_id=$1 AND cc.enabled=true ORDER BY c.code`,
      [connectorId]
    )).rows.map((item) => item.code);

    const run = (await client.query(
      `INSERT INTO provider_certification_runs(
         tenant_id,provider_id,connector_id,environment,status,requested_by
       ) VALUES($1,$2,$3,$4,'RUNNING',$5) RETURNING id`,
      [principal.tenantId, row.providerId, connectorId, row.environment, principal.userId]
    )).rows[0];
    if (!run) throw new Error("CERTIFICATION_RUN_INSERT_RETURNED_NO_ROW");

    return {
      runId: String(run.id),
      providerId: String(row.providerId),
      providerStatus: String(row.providerStatus),
      providerType: row.providerType as ProviderType,
      connector: connectorFromRow(row),
      capabilities
    };
  });
}

export interface CertificationCheckInput {
  checkCode: string;
  severity: "REQUIRED" | "ADVISORY";
  result: "PASS" | "FAIL" | "SKIP";
  message: string;
  details?: Record<string, unknown>;
}

export async function finishCertificationRun(
  principal: Principal,
  runId: string,
  checks: CertificationCheckInput[]
) {
  return withTenantContext(context(principal), async (client) => {
    for (const check of checks) {
      await client.query(
        `INSERT INTO provider_certification_checks(
           tenant_id,run_id,check_code,severity,result,message,details
         ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [
          principal.tenantId,
          runId,
          check.checkCode,
          check.severity,
          check.result,
          check.message,
          JSON.stringify(check.details ?? {})
        ]
      );
    }
    const requiredFailures = checks.filter(
      (check) => check.severity === "REQUIRED" && check.result === "FAIL"
    ).length;
    const status = requiredFailures === 0 ? "PASSED" : "FAILED";
    const summary = {
      checks: checks.length,
      passed: checks.filter((check) => check.result === "PASS").length,
      failed: checks.filter((check) => check.result === "FAIL").length,
      requiredFailures
    };
    const run = (await client.query(
      `UPDATE provider_certification_runs
          SET status=$2,completed_at=now(),summary=$3::jsonb
        WHERE id=$1 AND status='RUNNING'
        RETURNING *`,
      [runId, status, JSON.stringify(summary)]
    )).rows[0];
    if (!run) throw new Error("CERTIFICATION_RUN_NOT_RUNNING");
    await client.query(
      `INSERT INTO audit_logs(
         tenant_id,actor_user_id,action,resource_type,resource_id,after_state
       ) VALUES($1,$2,'provider.certification.run','certification_run',$3,$4::jsonb)`,
      [principal.tenantId, principal.userId, runId, JSON.stringify({ status, summary })]
    );
    return run;
  });
}

export async function listCertificationRuns(
  principal: Principal,
  connectorId: string,
  limit: number
) {
  return withTenantContext(context(principal), async (client) => (
    await client.query(
      `SELECT r.*,
              COALESCE(json_agg(c ORDER BY c.checked_at) FILTER (WHERE c.id IS NOT NULL),'[]') AS checks
         FROM provider_certification_runs r
         LEFT JOIN provider_certification_checks c ON c.run_id=r.id
        WHERE r.connector_id=$1
        GROUP BY r.id
        ORDER BY r.requested_at DESC
        LIMIT $2`,
      [connectorId, limit]
    )
  ).rows);
}

export async function approveCertification(
  principal: Principal,
  runId: string
) {
  return withTenantContext(context(principal), async (client) => {
    const run = (await client.query(
      `SELECT * FROM provider_certification_runs WHERE id=$1 FOR UPDATE`,
      [runId]
    )).rows[0];
    if (!run) throw new Error("CERTIFICATION_RUN_NOT_FOUND");
    if (run.status !== "PASSED") throw new Error("CERTIFICATION_RUN_NOT_PASSED");
    if (String(run.requested_by) === principal.userId) {
      throw new Error("MAKER_CHECKER_VIOLATION");
    }

    await client.query(
      `UPDATE providers SET status='CERTIFIED',updated_at=now()
        WHERE id=$1 AND status IN ('DEVELOPMENT','SANDBOX','CERTIFIED')`,
      [run.provider_id]
    );
    const updated = (await client.query(
      `UPDATE provider_certification_runs
          SET status='CERTIFIED',approved_by=$2,approved_at=now()
        WHERE id=$1 RETURNING *`,
      [runId, principal.userId]
    )).rows[0];
    await client.query(
      `INSERT INTO audit_logs(
         tenant_id,actor_user_id,action,resource_type,resource_id,after_state
       ) VALUES($1,$2,'provider.certification.approve','certification_run',$3,$4::jsonb)`,
      [principal.tenantId, principal.userId, runId, JSON.stringify(updated)]
    );
    return updated;
  });
}

export async function getOperationsQueues(principal: Principal) {
  return withTenantContext(context(principal), async (client) => {
    const row = (await client.query(
      `SELECT
         (SELECT count(*) FROM transactions
           WHERE normalized_status IN ('UNKNOWN','TIMED_OUT'))::int AS unknown_transactions,
         (SELECT COALESCE(sum(total_amount),0)::text FROM transactions
           WHERE normalized_status IN ('UNKNOWN','TIMED_OUT')) AS unknown_value,
         (SELECT count(*) FROM transactions WHERE refund_required=true)::int AS refund_required,
         (SELECT COALESCE(sum(total_amount),0)::text FROM transactions
           WHERE refund_required=true) AS refund_required_value,
         (SELECT count(*) FROM reconciliation_exceptions
           WHERE status IN ('OPEN','INVESTIGATING'))::int AS reconciliation_open,
         (SELECT count(*) FROM support_cases
           WHERE status NOT IN ('RESOLVED','CLOSED'))::int AS support_open,
         (SELECT count(*) FROM provider_health_events phe
           WHERE phe.id IN (
             SELECT DISTINCT ON (connector_id) id
             FROM provider_health_events ORDER BY connector_id,checked_at DESC
           ) AND phe.health_status IN ('OUTAGE','MAINTENANCE'))::int AS provider_outages,
         (SELECT count(*) FROM provider_certification_runs
           WHERE status='FAILED' AND requested_at > now()-interval '30 days')::int AS certification_failures_30d`
    )).rows[0];
    return row ?? {};
  });
}
