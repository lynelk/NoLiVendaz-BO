import type { FastifyInstance } from "fastify";
import { EnvironmentSecretResolver, parseRuntimeConfiguration } from "@nolivendaz/provider-sdk";
import { createProviderAdapter } from "@nolivendaz/provider-orchestrator";
import { requirePermission } from "../auth.js";
import {
  type CertificationCheckInput,
  finishCertificationRun,
  listCertificationRuns,
  startCertificationRun
} from "../repositories/phase4-repository.js";
import {
  approveCertificationSafely,
  failCertificationRun
} from "../repositories/phase4-guards-repository.js";

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
        const connectorEnabled = connector.enabled;
        checks.push(check(
          "connector.enabled",
          connectorEnabled ? "PASS" : "FAIL",
          connectorEnabled ? "Connector is enabled" : "Connector is disabled"
        ));
        const connectorOperational = ["ACTIVE","DEGRADED"].includes(connector.status);
        checks.push(check(
          "connector.operational_status",
          connectorOperational ? "PASS" : "FAIL",
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
          const missingEndpoints = certification.capabilities.filter(
            (capability) => endpointChecks[capability] !== true
          );
          checks.push(check(
            "capabilities.endpoint_contract",
            missingEndpoints.length === 0 ? "PASS" : "FAIL",
            missingEndpoints.length === 0
              ? "Declared capabilities have matching runtime endpoints"
              : `Missing endpoint contracts for: ${missingEndpoints.join(", ")}`,
            "REQUIRED",
            { missing: missingEndpoints }
          ));

          const fields = runtime.fields ?? {};
          const missingFields: string[] = [];
          const requireField = (capability: string, field: unknown, label: string) => {
            if (certification.capabilities.includes(capability) && !field) {
              missingFields.push(`${capability}:${label}`);
            }
          };
          requireField("vend.initiate", fields.providerTransactionId, "providerTransactionId");
          requireField("vend.initiate", fields.vendStatus ?? fields.providerStatus, "vendStatus/providerStatus");
          requireField("vend.status", fields.providerTransactionId, "providerTransactionId");
          requireField("refund.create", fields.providerRefundId, "providerRefundId");
          requireField("refund.create", fields.refundStatus ?? fields.providerStatus, "refundStatus/providerStatus");
          requireField("refund.status", fields.providerRefundId, "providerRefundId");
          requireField("refund.status", fields.refundStatus ?? fields.providerStatus, "refundStatus/providerStatus");
          requireField("settlement.list", fields.settlementId, "settlementId");
          requireField("settlement.list", fields.settlementCurrency, "settlementCurrency");
          requireField("settlement.list", fields.settlementGrossAmount, "settlementGrossAmount");
          requireField("settlement.list", fields.settlementStatus, "settlementStatus");
          requireField("settlement.list", fields.settlementPeriodStart, "settlementPeriodStart");
          requireField("settlement.list", fields.settlementPeriodEnd, "settlementPeriodEnd");
          checks.push(check(
            "capabilities.field_contract",
            missingFields.length === 0 ? "PASS" : "FAIL",
            missingFields.length === 0
              ? "Required normalization fields are configured"
              : `Missing field mappings: ${missingFields.join(", ")}`,
            "REQUIRED",
            { missing: missingFields }
          ));
        } else {
          checks.push(check(
            "capabilities.endpoint_contract",
            "FAIL",
            "Endpoint contracts cannot be checked until runtime configuration is valid"
          ));
          checks.push(check(
            "capabilities.field_contract",
            "FAIL",
            "Field contracts cannot be checked until runtime configuration is valid"
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

        let adapter: ReturnType<typeof createProviderAdapter> | undefined;
        let advertised = new Set<string>();
        if (runtime && connectorEnabled && connectorOperational) {
          try {
            adapter = createProviderAdapter(certification.providerType, connector, secrets);
            const adapterCapabilities = await adapter.getCapabilities();
            advertised = new Set(adapterCapabilities.map((item) => item.code));
            checks.push(check(
              "adapter.registered",
              "PASS",
              `Provider adapter is registered with ${adapterCapabilities.length} advertised capabilities`
            ));
          } catch (error) {
            checks.push(check(
              "adapter.registered",
              "FAIL",
              error instanceof Error ? error.message : "Provider adapter could not be instantiated"
            ));
          }
        } else {
          checks.push(check(
            "adapter.registered",
            "SKIP",
            "Adapter checks require a valid runtime and an operational connector"
          ));
        }

        if (adapter) {
          const sharedRuntimeCapabilities = new Set([
            "refund.create",
            "refund.status",
            "settlement.list"
          ]);
          const missingExecutable = certification.capabilities.filter((capability) => {
            if (sharedRuntimeCapabilities.has(capability)) return false;
            if (!advertised.has(capability)) return true;
            if (capability === "token.resend") return typeof adapter!.resendToken !== "function";
            if (capability === "device.list") return typeof adapter!.listDevices !== "function";
            if (capability === "device.status") return typeof adapter!.getDeviceStatus !== "function";
            return false;
          });
          checks.push(check(
            "capabilities.executable_contract",
            missingExecutable.length === 0 ? "PASS" : "FAIL",
            missingExecutable.length === 0
              ? "Declared capabilities have executable control-plane contracts"
              : `Capabilities are declared but not executable: ${missingExecutable.join(", ")}`,
            "REQUIRED",
            { missing: missingExecutable }
          ));
        } else {
          checks.push(check(
            "capabilities.executable_contract",
            "FAIL",
            "Executable capability contracts cannot be verified without an operational adapter"
          ));
        }

        const canProbeProvider = Boolean(
          adapter && runtime && urlValid && credentialOkay && connectorEnabled && connectorOperational
        );
        if (canProbeProvider) {
          const health = await adapter!.healthCheck();
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
        } else {
          checks.push(check(
            "provider.health",
            "SKIP",
            "Provider health request skipped because transport, credentials, runtime or connector state failed preflight"
          ));
        }

        const result = await finishCertificationRun(
          request.principal!,
          certification.runId,
          checks
        );
        return reply.code(result.status === "PASSED" ? 200 : 422).send({ data: result });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (runId) {
          try {
            await failCertificationRun(request.principal!, runId, message);
          } catch (finalizationError) {
            request.log.error(
              { err: finalizationError, runId },
              "Certification failure finalization failed"
            );
          }
        }
        request.log.error({ err: error, runId }, "Certification run failed");
        return reply.code(409).send({
          error: "CERTIFICATION_RUN_FAILED",
          message,
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
          data: await approveCertificationSafely(
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
