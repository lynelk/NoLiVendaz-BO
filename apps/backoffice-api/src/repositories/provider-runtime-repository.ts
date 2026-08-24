import type { ConnectorRecord, Principal, ProviderType } from "@nolivendaz/canonical-models";
import type { ProviderHealthResult } from "@nolivendaz/provider-sdk";
import { withTenantContext } from "@nolivendaz/database";

const context = (principal: Principal) => ({ tenantId: principal.tenantId, isPlatformAdmin: principal.isPlatformAdmin, userId: principal.userId });

export interface ConnectorRuntimeRecord { providerId:string; providerCode:string; providerType:ProviderType; connector:ConnectorRecord; }

export async function getConnectorRuntime(principal: Principal, providerId: string, connectorId?: string): Promise<ConnectorRuntimeRecord> {
  return withTenantContext(context(principal), async client => {
    const result = await client.query(`SELECT p.id AS "providerId", p.code AS "providerCode", p.provider_type AS "providerType", pc.id, pc.provider_id AS "providerId2", pc.name, pc.environment, pc.api_version AS "apiVersion", pc.base_url AS "baseUrl", pc.auth_type AS "authType", pc.credential_reference AS "credentialReference", pc.webhook_secret_reference AS "webhookSecretReference", pc.timeout_ms AS "timeoutMs", pc.retry_policy AS "retryPolicy", pc.runtime_configuration AS "runtimeConfiguration", pc.health_check_path AS "healthCheckPath", pc.status, pc.enabled, pc.created_at AS "createdAt", pc.updated_at AS "updatedAt" FROM providers p JOIN provider_connectors pc ON pc.provider_id=p.id WHERE p.id=$1 AND ($2::uuid IS NULL OR pc.id=$2) AND pc.enabled=true ORDER BY CASE pc.environment WHEN 'PRODUCTION' THEN 0 ELSE 1 END, pc.created_at DESC LIMIT 1`, [providerId, connectorId ?? null]);
    const row = result.rows[0] as Record<string,unknown>|undefined; if (!row) throw new Error("ACTIVE_CONNECTOR_NOT_FOUND");
    const connector: ConnectorRecord = { id:String(row.id), providerId:String(row.providerId2), name:String(row.name), environment:row.environment as ConnectorRecord["environment"], apiVersion:row.apiVersion as string|null, baseUrl:String(row.baseUrl), authType:row.authType as ConnectorRecord["authType"], credentialReference:row.credentialReference as string|null, webhookSecretReference:row.webhookSecretReference as string|null, timeoutMs:Number(row.timeoutMs), retryPolicy:row.retryPolicy as Record<string,unknown>, runtimeConfiguration:row.runtimeConfiguration as Record<string,unknown>, healthCheckPath:row.healthCheckPath as string|null, status:row.status as ConnectorRecord["status"], enabled:Boolean(row.enabled), createdAt:String(row.createdAt), updatedAt:String(row.updatedAt) };
    return { providerId:String(row.providerId), providerCode:String(row.providerCode), providerType:row.providerType as ProviderType, connector };
  });
}

export async function connectorHasCapability(principal: Principal, connectorId: string, capabilityCode: string): Promise<boolean> {
  return withTenantContext(context(principal), async client => {
    const result = await client.query(`SELECT 1 FROM connector_capabilities cc JOIN capabilities c ON c.id=cc.capability_id WHERE cc.connector_id=$1 AND cc.enabled=true AND c.code=$2 LIMIT 1`, [connectorId, capabilityCode]);
    return result.rowCount === 1;
  });
}

export async function recordProviderHealth(principal: Principal, runtime: ConnectorRuntimeRecord, health: ProviderHealthResult): Promise<void> {
  await withTenantContext(context(principal), async client => { await client.query(`INSERT INTO provider_health_events (tenant_id,provider_id,connector_id,health_status,latency_ms,details,checked_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`, [principal.tenantId,runtime.providerId,runtime.connector.id,health.status,health.latencyMs ?? null,JSON.stringify(health.details ?? {}),health.checkedAt]); });
}

export async function getLatestProviderHealth(principal: Principal, providerId: string) {
  return withTenantContext(context(principal), async client => { const result=await client.query(`SELECT phe.id,phe.provider_id AS "providerId",phe.connector_id AS "connectorId",phe.health_status AS status,phe.latency_ms AS "latencyMs",phe.details,phe.checked_at AS "checkedAt" FROM provider_health_events phe WHERE phe.provider_id=$1 ORDER BY phe.checked_at DESC LIMIT 20`,[providerId]); return result.rows; });
}
