import { withTenantContext } from "@nolivendaz/database";

const context = (tenantId: string) => ({ tenantId, isPlatformAdmin: false });

export async function runRecoveryEscalations(tenantId: string): Promise<number> {
  return withTenantContext(context(tenantId), async (client) => {
    const transactions = await client.query(
      `INSERT INTO support_cases(
         tenant_id,case_number,source,source_key,category,priority,status,title,
         description,transaction_id,provider_id,connector_id,metadata
       )
       SELECT
         t.tenant_id,
         'SC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),
         'RECOVERY',
         'transaction-unknown:' || t.id,
         'TRANSACTION_UNKNOWN',
         CASE WHEN t.recovery_attempts>=5 THEN 'CRITICAL' ELSE 'HIGH' END,
         'OPEN',
         'Unknown vending outcome requires investigation',
         CASE
           WHEN t.provider_transaction_id IS NULL
             THEN 'Provider transaction reference is unavailable; automatic query is unsafe.'
           WHEN pc.enabled=false OR pc.status NOT IN ('ACTIVE','DEGRADED')
             THEN 'The original connector is not operational, so automatic provider querying cannot continue safely.'
           ELSE 'Repeated provider queries have not resolved the vending outcome.'
         END,
         t.id,t.provider_id,t.connector_id,
         jsonb_build_object(
           'recoveryAttempts',t.recovery_attempts,
           'lastError',t.recovery_last_error,
           'connectorStatus',pc.status,
           'connectorEnabled',pc.enabled
         )
       FROM transactions t
       JOIN provider_connectors pc ON pc.id=t.connector_id
       WHERE t.tenant_id=$1
         AND t.normalized_status IN ('UNKNOWN','TIMED_OUT')
         AND COALESCE(t.unknown_since,t.updated_at)<now()-interval '10 minutes'
         AND (
           t.provider_transaction_id IS NULL
           OR t.recovery_attempts>=5
           OR pc.enabled=false
           OR pc.status NOT IN ('ACTIVE','DEGRADED')
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
         r.tenant_id,
         'SC-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),
         'RECOVERY',
         'refund-unknown:' || r.id,
         'REFUND',
         CASE WHEN r.recovery_attempts>=5 THEN 'CRITICAL' ELSE 'HIGH' END,
         'OPEN',
         'Refund recovery requires investigation',
         CASE
           WHEN r.provider_refund_id IS NULL
             THEN 'Provider refund reference is unavailable; automatic status query is unsafe.'
           WHEN pc.enabled=false OR pc.status NOT IN ('ACTIVE','DEGRADED')
             THEN 'The original refund connector is not operational.'
           WHEN NOT EXISTS (
             SELECT 1 FROM connector_capabilities cc
             JOIN capabilities c ON c.id=cc.capability_id
             WHERE cc.connector_id=pc.id AND cc.enabled=true AND c.code='refund.status'
           ) THEN 'The original connector does not declare refund.status, so recovery cannot query safely.'
           ELSE 'Repeated refund status queries have not resolved the outcome.'
         END,
         r.transaction_id,r.provider_id,r.connector_id,r.id,
         jsonb_build_object(
           'recoveryAttempts',r.recovery_attempts,
           'lastError',r.recovery_last_error,
           'connectorStatus',pc.status,
           'connectorEnabled',pc.enabled
         )
       FROM refunds r
       JOIN provider_connectors pc ON pc.id=r.connector_id
       WHERE r.tenant_id=$1
         AND r.status IN ('PENDING','UNKNOWN')
         AND r.requested_at<now()-interval '30 minutes'
         AND (
           r.provider_refund_id IS NULL
           OR r.recovery_attempts>=5
           OR pc.enabled=false
           OR pc.status NOT IN ('ACTIVE','DEGRADED')
           OR NOT EXISTS (
             SELECT 1 FROM connector_capabilities cc
             JOIN capabilities c ON c.id=cc.capability_id
             WHERE cc.connector_id=pc.id AND cc.enabled=true AND c.code='refund.status'
           )
         )
       ON CONFLICT (tenant_id,source_key) WHERE source_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [tenantId]
    );

    await client.query(
      `INSERT INTO support_case_events(
         tenant_id,support_case_id,event_type,to_status,note,payload
       )
       SELECT
         sc.tenant_id,sc.id,'CASE_OPENED','OPEN',sc.description,
         jsonb_build_object('source','RECOVERY','sourceKey',sc.source_key)
       FROM support_cases sc
       WHERE sc.tenant_id=$1
         AND sc.source='RECOVERY'
         AND NOT EXISTS (
           SELECT 1 FROM support_case_events sce
           WHERE sce.support_case_id=sc.id
         )`,
      [tenantId]
    );

    const created = (transactions.rowCount ?? 0) + (refunds.rowCount ?? 0);
    if (created > 0) {
      await client.query(
        `INSERT INTO audit_logs(
           tenant_id,action,resource_type,after_state
         ) VALUES($1,'recovery.support_escalation','support_case',$2::jsonb)`,
        [tenantId, JSON.stringify({ created })]
      );
    }
    return created;
  });
}
