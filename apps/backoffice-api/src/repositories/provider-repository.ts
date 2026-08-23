import type {
  ConnectorCreateInput,
  ConnectorRecord,
  Principal,
  ProviderCreateInput,
  ProviderRecord
} from "@nolivendaz/canonical-models";
import { withTenantContext } from "@nolivendaz/database";

function dbContext(principal: Principal) {
  return {
    tenantId: principal.tenantId,
    isPlatformAdmin: principal.isPlatformAdmin,
    userId: principal.userId
  };
}

export async function listProviders(
  principal: Principal
): Promise<ProviderRecord[]> {
  return withTenantContext(dbContext(principal), async (client) => {
    const result = await client.query(
      `SELECT
         id,
         tenant_id AS "tenantId",
         code,
         name,
         legal_name AS "legalName",
         provider_type AS "providerType",
         scope,
         status,
         country,
         supported_currencies AS "supportedCurrencies",
         supported_regions AS "supportedRegions",
         sla_tier AS "slaTier",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM providers
       ORDER BY name`
    );
    return result.rows as ProviderRecord[];
  });
}

export async function createProvider(
  principal: Principal,
  input: ProviderCreateInput
): Promise<ProviderRecord> {
  if (input.scope === "PLATFORM" && !principal.isPlatformAdmin) {
    throw new Error("PLATFORM_PROVIDER_REQUIRES_PLATFORM_ADMIN");
  }

  return withTenantContext(dbContext(principal), async (client) => {
    const tenantId = input.scope === "PLATFORM" ? null : principal.tenantId;
    const result = await client.query(
      `INSERT INTO providers (
         tenant_id,
         code,
         name,
         legal_name,
         provider_type,
         scope,
         status,
         country,
         supported_currencies,
         supported_regions,
         sla_tier,
         created_by
       )
       VALUES ($1,$2,$3,$4,$5,$6,'DRAFT',$7,$8,$9,$10,$11)
       RETURNING
         id,
         tenant_id AS "tenantId",
         code,
         name,
         legal_name AS "legalName",
         provider_type AS "providerType",
         scope,
         status,
         country,
         supported_currencies AS "supportedCurrencies",
         supported_regions AS "supportedRegions",
         sla_tier AS "slaTier",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [
        tenantId,
        input.code,
        input.name,
        input.legalName ?? null,
        input.providerType,
        input.scope,
        input.country ?? null,
        input.supportedCurrencies,
        input.supportedRegions,
        input.slaTier ?? null,
        principal.userId
      ]
    );

    const row = result.rows[0] as ProviderRecord | undefined;
    if (!row) throw new Error("PROVIDER_INSERT_RETURNED_NO_ROW");

    await client.query(
      `INSERT INTO audit_logs (
         tenant_id, actor_user_id, action, resource_type, resource_id, after_state
       )
       VALUES ($1,$2,'provider.create','provider',$3,$4::jsonb)`,
      [
        principal.tenantId,
        principal.userId,
        row.id,
        JSON.stringify(row)
      ]
    );

    return row;
  });
}

export async function createConnector(
  principal: Principal,
  providerId: string,
  input: ConnectorCreateInput
): Promise<ConnectorRecord> {
  return withTenantContext(dbContext(principal), async (client) => {
    const result = await client.query(
      `INSERT INTO provider_connectors (
         provider_id,
         name,
         environment,
         api_version,
         base_url,
         auth_type,
         credential_reference,
         webhook_secret_reference,
         timeout_ms,
         retry_policy,
         health_check_path,
         status,
         enabled,
         created_by
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,'DISABLED',$12,$13)
       RETURNING
         id,
         provider_id AS "providerId",
         name,
         environment,
         api_version AS "apiVersion",
         base_url AS "baseUrl",
         auth_type AS "authType",
         credential_reference AS "credentialReference",
         webhook_secret_reference AS "webhookSecretReference",
         timeout_ms AS "timeoutMs",
         retry_policy AS "retryPolicy",
         health_check_path AS "healthCheckPath",
         status,
         enabled,
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [
        providerId,
        input.name,
        input.environment,
        input.apiVersion ?? null,
        input.baseUrl,
        input.authType,
        input.credentialReference ?? null,
        input.webhookSecretReference ?? null,
        input.timeoutMs,
        JSON.stringify(input.retryPolicy),
        input.healthCheckPath ?? null,
        input.enabled,
        principal.userId
      ]
    );

    const row = result.rows[0] as ConnectorRecord | undefined;
    if (!row) throw new Error("CONNECTOR_INSERT_RETURNED_NO_ROW");

    await client.query(
      `INSERT INTO audit_logs (
         tenant_id, actor_user_id, action, resource_type, resource_id, after_state
       )
       VALUES ($1,$2,'connector.create','provider_connector',$3,$4::jsonb)`,
      [
        principal.tenantId,
        principal.userId,
        row.id,
        JSON.stringify(row)
      ]
    );

    return row;
  });
}

export async function replaceConnectorCapabilities(
  principal: Principal,
  connectorId: string,
  capabilityCodes: string[]
): Promise<string[]> {
  return withTenantContext(dbContext(principal), async (client) => {
    const known = await client.query<{ id: string; code: string }>(
      `SELECT id, code
         FROM capabilities
        WHERE code = ANY($1::text[])`,
      [capabilityCodes]
    );

    const knownCodes = new Set(known.rows.map((row) => row.code));
    const unknown = capabilityCodes.filter((code) => !knownCodes.has(code));

    if (unknown.length > 0) {
      throw new Error(`UNKNOWN_CAPABILITIES:${unknown.join(",")}`);
    }

    await client.query(
      "DELETE FROM connector_capabilities WHERE connector_id = $1",
      [connectorId]
    );

    for (const capability of known.rows) {
      await client.query(
        `INSERT INTO connector_capabilities (
           connector_id, capability_id, enabled, configured_by
         )
         VALUES ($1,$2,true,$3)`,
        [connectorId, capability.id, principal.userId]
      );
    }

    await client.query(
      `INSERT INTO audit_logs (
         tenant_id, actor_user_id, action, resource_type, resource_id, after_state
       )
       VALUES ($1,$2,'connector.capabilities.replace','provider_connector',$3,$4::jsonb)`,
      [
        principal.tenantId,
        principal.userId,
        connectorId,
        JSON.stringify({ capabilities: capabilityCodes })
      ]
    );

    return capabilityCodes;
  });
}
