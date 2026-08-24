import type { FastifyInstance } from "fastify";
import { EnvironmentSecretResolver, parseRuntimeConfiguration } from "@nolivendaz/provider-sdk";
import { createProviderAdapter } from "@nolivendaz/provider-orchestrator";
import { requirePermission } from "../auth.js";
import {
  approveCertification,
  type CertificationCheckInput,
  finishCertificationRun,
  listCertificationRuns,
  startCertificationRun
} from "../repositories/phase4-repository.js";

const secrets = new EnvironmentSecretResolver();

function check(
  checkCode: string,
  result: "PASS" | "FAIL" | "SKIP",
  message: string,
  severity: "REQUIRED" | "ADVISORY" = "REQUIRED",
  details?: Record<string, unknown>
): CertificationCheckInput {
  return {
    checkCode,
    severity,
    result,
    message,
    ...(details ? { details } : {})
  };
}

export async function registerCertificationRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/v1/connectors/:connectorId/certification-runs",
    { preHandler: [app.authenticate, requirePermission("certification.run")] },
    async (request, reply) => {
      let runId: string | undefined;
      try {
        const certification = await startCertificationRun(
          request.principal!,
          (request.params as { connectorId: string }).connectorId
        );
        runId = certification.runId;
        const checks: CertificationCheckInput[] = [];
        const connector = certification.connector;

        checks.push(check(
          "provider.lifecycle",
          ["DEVELOPMENT","SANDBOX","CERTIFIED"].includes(certification.providerStatus) ? "PASS" : "FAIL",
          `Provider lifecycle is ${certification.providerStatus}`
        ));
        checks.push(check(
          "connector.enabled",
          connector.enabled ? "PASS" : "FAIL",
          connector.enabled ? "Connector is enabled" : "Connector is disabled"
        ));
        checks.push(check(
          "connector.operational_status",
          ["ACTIVE","DEGRADED"].includes(connector.status) ? "PASS" : "FAIL",
          `Connector operational status is ${connector.status}`
        ));

        let urlValid = false;
        try {
          const url = new URL(connector.baseUrl);
          urlValid = connector.environment === "DEVELOPMENT" || url.protocol === "https:";
        } catch {
          urlValid = false;
        }
        checks.push(check(
          "transport.https",
          urlValid ? "PASS" : "FAIL",
          urlValid
            ? "Transport URL is acceptable for the connector environment"
            : "Non-development connectors must use a valid HTTPS base URL"
        ));

        const credentialOkay = connector.authType === "NONE" || Boolean(connector.credentialReference);
        checks.push(check(
          "credentials.reference",
          credentialOkay ? "PASS" : "FAIL",
          credentialOkay
            ? "Credential reference requirements are satisfied"
            : "Authenticated connectors require a credential reference"
        ));

        let runtime: ReturnType<typeof parseRuntimeConfiguration> | undefined;
        try {
          runtime = parseRuntimeConfiguration(connector);
          checks.push(check("runtime.configuration", "PASS", "Runtime configuration is parseable"));
        } catch (error) {
          checks.push(check(
            "runtime.configuration",
            "FAIL",
            error instanceof Error ? error.message : "Runtime configuration is invalid"
          ));
        }

        checks.push(check(
          "capabilities.declared",
          certification.capabilities.length > 0 ? "PASS" : "FAIL",
          certification.capabilities.length > 0
            ? `${certification.capabilities.length} connector capabilities declared`
            : "At least one connector capability must be declared"
        ));

        if (runtime) {
          const endpointChecks: Record<string, boolean> = {
            "vend.initiate": Boolean(runtime.endpoints.initiateVend),
            "vend.status": Boolean(runtime.endpoints.getVendStatus),
            "transaction.query": Boolean(runtime.endpoints.getTransaction ?? runtime.endpoints.getVendStatus),
            "refund.create": Boolean(runtime.endpoints.initiateRefund),
            "refund.status": Boolean(runtime.endpoints.getRefundStatus),
            "token.resend": Boolean(runtime.endpoints.resendToken),
            "device.list": Boolean(runtime.endpoints.devices),
            "device.status": Boolean(runtime.endpoints.deviceStatus),
            "settlement.list": Boolean(runtime.endpoints.settlements),
            "webhook.receive": true
          };
          const missing = certification.capabilities.filter(
            (capability) => endpointChecks[capability] === false
          );
          checks.push(check(
            "capabilities.endpoint_contract",
            missing.length === 0 ? "PASS" : "FAIL",
            missing.length === 0
              ? "Declared capabilities have matching runtime contracts"
              : `Missing endpoint contracts for: ${missing.join(", ")}`,
            "REQUIRED",
            { missing }
          ));
        } else {
          checks.push(check(
            "capabilities.endpoint_contract",
            "FAIL",
            "Endpoint contracts cannot be checked until runtime configuration is valid"
          ));
        }

        const webhookRequired = certification.capabilities.includes("webhook.receive");
        checks.push(check(
          "webhook.secret_reference",
          !webhookRequired || Boolean(connector.webhookSecretReference) ? "PASS" : "FAIL",
          webhookRequired
            ? (connector.webhookSecretReference
                ? "Webhook secret reference is configured"
                : "webhook.receive requires a webhook secret reference")
            : "Webhook capability is not declared"
        ));

        try {
          const adapter = createProviderAdapter(certification.providerType, connector, secrets);
          const adapterCapabilities = await adapter.getCapabilities();
          checks.push(check(
            "adapter.registered",
            "PASS",
            `Provider adapter is registered with ${adapterCapabilities.length} executable capabilities`
          ));
          const health = await adapter.healthCheck();
          checks.push(check(
            "provider.health",
            health.status === "HEALTHY" || health.status === "DEGRADED" ? "PASS" : "FAIL",
            `Provider health check returned ${health.status}`,
            "REQUIRED",
            {
              status: health.status,
              ...(health.latencyMs !== undefined ? { latencyMs: health.latencyMs } : {}),
              ...(health.details ? { details: health.details } : {})
            }
          ));
        } catch (error) {
          checks.push(check(
            "adapter.registered",
            "FAIL",
            error instanceof Error ? error.message : "Provider adapter could not be instantiated"
          ));
          checks.push(check(
            "provider.health",
            "SKIP",
            "Health check skipped because the adapter is not operational"
          ));
        }

        const result = await finishCertificationRun(
          request.principal!,
          certification.runId,
          checks
        );
        return reply.code(result.status === "PASSED" ? 200 : 422).send({ data: result });
      } catch (error) {
        request.log.error({ err: error, runId }, "Certification run failed");
        return reply.code(409).send({
          error: "CERTIFICATION_RUN_FAILED",
          message: error instanceof Error ? error.message : "Unknown error",
          ...(runId ? { runId } : {})
        });
      }
    }
  );

  app.get(
    "/api/v1/connectors/:connectorId/certification-runs",
    { preHandler: [app.authenticate, requirePermission("certification.read")] },
    async (request) => ({
      data: await listCertificationRuns(
        request.principal!,
        (request.params as { connectorId: string }).connectorId,
        50
      )
    })
  );

  app.post(
    "/api/v1/certification-runs/:runId/approve",
    { preHandler: [app.authenticate, requirePermission("certification.approve")] },
    async (request, reply) => {
      try {
        return {
          data: await approveCertification(
            request.principal!,
            (request.params as { runId: string }).runId
          )
        };
      } catch (error) {
        return reply.code(409).send({
          error: "CERTIFICATION_APPROVAL_FAILED",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );
}
