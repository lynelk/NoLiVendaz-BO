import type {
  ConnectorRecord,
  ProviderType,
  TransactionStatus,
  VendStatus
} from "@nolivendaz/canonical-models";
import type { NormalizedProviderEvent } from "@nolivendaz/provider-sdk";
import { withTenantContext } from "@nolivendaz/database";

const tenantContext = (tenantId: string) => ({ tenantId, isPlatformAdmin: false });
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: string | undefined): value is string => Boolean(value && UUID_PATTERN.test(value));

export interface WebhookRuntime {
  tenantId: string;
  providerId: string;
  providerType: ProviderType;
  connector: ConnectorRecord;
}

export async function getWebhookRuntime(
  tenantId: string,
  providerCode: string,
  connectorId: string
): Promise<WebhookRuntime> {
  return withTenantContext(tenantContext(tenantId), async (client) => {
    const result = await client.query(
      `SELECT
         p.id AS "providerId",
         p.provider_type AS "providerType",
         pc.id AS "connectorId",
         pc.provider_id AS "connectorProviderId",
         pc.name,
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
         pc.status,
         pc.enabled,
         pc.created_at AS "createdAt",
         pc.updated_at AS "updatedAt"
       FROM providers p
       JOIN provider_connectors pc ON pc.provider_id = p.id
       WHERE p.code = $1 AND pc.id = $2 AND pc.enabled = true
       LIMIT 1`,
      [providerCode, connectorId]
    );

    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error("WEBHOOK_CONNECTOR_NOT_FOUND");

    const connector: ConnectorRecord = {
      id: String(row.connectorId),
      providerId: String(row.connectorProviderId),
      name: String(row.name),
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
      status: row.status as ConnectorRecord["status"],
      enabled: Boolean(row.enabled),
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt)
    };

    return {
      tenantId,
      providerId: String(row.providerId),
      providerType: row.providerType as ProviderType,
      connector
    };
  });
}

export async function hasWebhookHash(runtime: WebhookRuntime, hash: string): Promise<boolean> {
  return withTenantContext(tenantContext(runtime.tenantId), async (client) => {
    const result = await client.query(
      `SELECT 1 FROM webhook_events
       WHERE connector_id = $1 AND payload_hash = $2
       LIMIT 1`,
      [runtime.connector.id, hash]
    );
    return (result.rowCount ?? 0) > 0;
  });
}

export async function recordAndApplyWebhook(
  runtime: WebhookRuntime,
  hash: string,
  headers: Record<string, unknown>,
  payload: Record<string, unknown>,
  events: NormalizedProviderEvent[]
): Promise<{ webhookId: string; transactionsUpdated: number }> {
  return withTenantContext(tenantContext(runtime.tenantId), async (client) => {
    const primary = events[0];
    const inserted = await client.query(
      `INSERT INTO webhook_events (
         tenant_id, provider_id, connector_id, external_event_id, event_type,
         payload_hash, signature_valid, processing_status, raw_payload, headers
       ) VALUES ($1,$2,$3,$4,$5,$6,true,'RECEIVED',$7::jsonb,$8::jsonb)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        runtime.tenantId,
        runtime.providerId,
        runtime.connector.id,
        primary?.id ?? null,
        primary?.type ?? null,
        hash,
        JSON.stringify(payload),
        JSON.stringify(headers)
      ]
    );

    const webhookId = inserted.rows[0]?.id as string | undefined;
    if (!webhookId) throw new Error("WEBHOOK_DUPLICATE");

    let transactionsUpdated = 0;
    for (const event of events) {
      let transactionId: string | undefined;

      if (isUuid(event.correlationId)) {
        const match = await client.query(
          `SELECT id FROM transactions
           WHERE provider_id = $1 AND correlation_id = $2::uuid
           LIMIT 1`,
          [runtime.providerId, event.correlationId]
        );
        transactionId = match.rows[0]?.id as string | undefined;
      }

      if (!transactionId && event.providerTransactionId) {
        const match = await client.query(
          `SELECT id FROM transactions
           WHERE provider_id = $1 AND provider_transaction_id = $2
           LIMIT 1`,
          [runtime.providerId, event.providerTransactionId]
        );
        transactionId = match.rows[0]?.id as string | undefined;
      }

      if (!transactionId) continue;
      const transactionStatus = event.vendStatus ? statusFromVend(event.vendStatus) : null;

      await client.query(
        `INSERT INTO transaction_events (
           tenant_id, transaction_id, event_type, normalized_status,
           provider_status, payload, source, correlation_id, occurred_at
         ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,'provider-webhook',$7::uuid,$8)`,
        [
          runtime.tenantId,
          transactionId,
          event.type,
          transactionStatus,
          event.providerStatus ?? null,
          JSON.stringify(event.payload),
          isUuid(event.correlationId) ? event.correlationId : null,
          event.occurredAt
        ]
      );

      if (event.vendStatus) {
        await client.query(
          `UPDATE transactions
           SET normalized_status = $2,
               vend_status = $3,
               provider_status = COALESCE($4, provider_status),
               provider_transaction_id = COALESCE($5, provider_transaction_id),
               unknown_since = CASE
                 WHEN $2 = 'UNKNOWN' THEN COALESCE(unknown_since, now())
                 ELSE NULL
               END,
               updated_at = now(),
               completed_at = CASE
                 WHEN $2 = 'FULFILLED' THEN COALESCE(completed_at, now())
                 ELSE completed_at
               END
           WHERE id = $1`,
          [
            transactionId,
            transactionStatus,
            event.vendStatus,
            event.providerStatus ?? null,
            event.providerTransactionId ?? null
          ]
        );
      }
      transactionsUpdated += 1;
    }

    await client.query(
      `UPDATE webhook_events
       SET processing_status = 'PROCESSED', processed_at = now()
       WHERE id = $1`,
      [webhookId]
    );

    return { webhookId, transactionsUpdated };
  });
}

function statusFromVend(status: VendStatus): TransactionStatus {
  if (status === "FULFILLED") return "FULFILLED";
  if (status === "FAILED") return "FAILED";
  if (status === "UNKNOWN") return "UNKNOWN";
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "ACCEPTED") return "ACCEPTED";
  return "SUBMITTED";
}
