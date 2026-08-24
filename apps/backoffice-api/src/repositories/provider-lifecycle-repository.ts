import type { Principal } from "@nolivendaz/canonical-models";
import { withTenantContext } from "@nolivendaz/database";

const context = (principal: Principal) => ({
  tenantId: principal.tenantId,
  isPlatformAdmin: principal.isPlatformAdmin,
  userId: principal.userId
});

export async function advanceProviderLifecycle(
  principal: Principal,
  providerId: string,
  action: "START_DEVELOPMENT" | "OPEN_SANDBOX"
) {
  return withTenantContext(context(principal), async (client) => {
    const current = (await client.query(
      `SELECT id,status,scope,tenant_id FROM providers WHERE id=$1 FOR UPDATE`,
      [providerId]
    )).rows[0];
    if (!current) throw new Error("PROVIDER_NOT_FOUND");

    const transition = action === "START_DEVELOPMENT"
      ? { from: "DRAFT", to: "DEVELOPMENT" }
      : { from: "DEVELOPMENT", to: "SANDBOX" };
    if (current.status !== transition.from) {
      throw new Error(`INVALID_PROVIDER_LIFECYCLE_TRANSITION:${current.status}:${action}`);
    }

    const updated = (await client.query(
      `UPDATE providers SET status=$2,updated_at=now()
        WHERE id=$1 AND status=$3 RETURNING *`,
      [providerId, transition.to, transition.from]
    )).rows[0];
    if (!updated) throw new Error("PROVIDER_LIFECYCLE_STATE_CHANGED");

    await client.query(
      `INSERT INTO audit_logs(
         tenant_id,actor_user_id,action,resource_type,resource_id,before_state,after_state
       ) VALUES($1,$2,'provider.lifecycle.advance','provider',$3,$4::jsonb,$5::jsonb)`,
      [
        principal.tenantId,
        principal.userId,
        providerId,
        JSON.stringify({ status: transition.from }),
        JSON.stringify({ status: transition.to, action })
      ]
    );
    return updated;
  });
}

export async function setPreproductionConnectorState(
  principal: Principal,
  connectorId: string,
  input: { status: "ACTIVE" | "DISABLED" | "MAINTENANCE"; enabled: boolean }
) {
  return withTenantContext(context(principal), async (client) => {
    const current = (await client.query(
      `SELECT pc.*,p.status AS provider_status
         FROM provider_connectors pc
         JOIN providers p ON p.id=pc.provider_id
        WHERE pc.id=$1 FOR UPDATE OF pc`,
      [connectorId]
    )).rows[0];
    if (!current) throw new Error("CONNECTOR_NOT_FOUND");
    if (current.environment === "PRODUCTION") {
      throw new Error("PRODUCTION_CONNECTOR_STATE_REQUIRES_SEPARATE_APPROVAL");
    }
    if (!["DEVELOPMENT","SANDBOX","CERTIFIED"].includes(String(current.provider_status))) {
      throw new Error(`PROVIDER_NOT_READY_FOR_CONNECTOR_ACTIVATION:${current.provider_status}`);
    }
    if (input.status === "ACTIVE" && !input.enabled) {
      throw new Error("ACTIVE_CONNECTOR_MUST_BE_ENABLED");
    }
    if (input.status === "DISABLED" && input.enabled) {
      throw new Error("DISABLED_CONNECTOR_CANNOT_BE_ENABLED");
    }

    const updated = (await client.query(
      `UPDATE provider_connectors
          SET status=$2,enabled=$3,updated_at=now()
        WHERE id=$1 RETURNING
          id,provider_id AS "providerId",name,environment,
          api_version AS "apiVersion",base_url AS "baseUrl",auth_type AS "authType",
          credential_reference AS "credentialReference",
          webhook_secret_reference AS "webhookSecretReference",
          timeout_ms AS "timeoutMs",retry_policy AS "retryPolicy",
          runtime_configuration AS "runtimeConfiguration",
          health_check_path AS "healthCheckPath",status,enabled,
          created_at AS "createdAt",updated_at AS "updatedAt"`,
      [connectorId, input.status, input.enabled]
    )).rows[0];
    if (!updated) throw new Error("CONNECTOR_STATE_UPDATE_FAILED");

    await client.query(
      `INSERT INTO audit_logs(
         tenant_id,actor_user_id,action,resource_type,resource_id,before_state,after_state
       ) VALUES($1,$2,'connector.preproduction_state.update','provider_connector',$3,$4::jsonb,$5::jsonb)`,
      [
        principal.tenantId,
        principal.userId,
        connectorId,
        JSON.stringify({ status: current.status, enabled: current.enabled }),
        JSON.stringify({ status: input.status, enabled: input.enabled })
      ]
    );
    return updated;
  });
}
