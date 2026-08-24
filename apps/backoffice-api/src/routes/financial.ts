import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ConnectorEnvironmentSchema } from "@nolivendaz/canonical-models";
import { EnvironmentSecretResolver } from "@nolivendaz/provider-sdk";
import {
  executeRefundSafely,
  fetchProviderSettlements,
  type RefundExecutionResult
} from "@nolivendaz/provider-orchestrator";
import { requirePermission } from "../auth.js";
import {
  connectorHasCapability,
  getConnectorRuntimeForCapability
} from "../repositories/provider-runtime-repository.js";
import {
  approveRefund,
  listRefunds,
  listSettlements,
  recordRefundResult,
  requestRefund
} from "../repositories/phase3-repository.js";
import {
  claimRefundDispatch,
  completeRefundDispatch,
  getApprovedRefundRuntime,
  upsertSettlementsTenantSafe
} from "../repositories/phase3-safety-repository.js";

const secrets = new EnvironmentSecretResolver();
const environmentResult = ConnectorEnvironmentSchema.safeParse(
  (process.env.PROVIDER_RUNTIME_ENV ?? "PRODUCTION").toUpperCase()
);
if (!environmentResult.success) throw new Error("INVALID_PROVIDER_RUNTIME_ENV");
const requiredEnvironment = environmentResult.data;

const amount = z.string()
  .regex(/^\d+(\.\d{1,6})?$/)
  .refine((value) => Number(value) > 0, "Amount must be greater than zero");
const refundSchema = z.object({
  amount,
  reason: z.string().min(5).max(1000),
  idempotencyKey: z.string().min(8).max(200)
});

export async function registerFinancialRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/v1/transactions/:transactionId/refunds",
    { preHandler: [app.authenticate, requirePermission("refund.request")] },
    async (request, reply) => {
      const parsed = refundSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues
        });
      }
      try {
        return reply.code(201).send({
          data: await requestRefund(
            request.principal!,
            (request.params as { transactionId: string }).transactionId,
            parsed.data
          )
        });
      } catch (error) {
        return reply.code(409).send({
          error: "REFUND_REQUEST_FAILED",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  app.post(
    "/api/v1/refunds/:refundId/approve",
    { preHandler: [app.authenticate, requirePermission("refund.approve")] },
    async (request, reply) => {
      const refundId = (request.params as { refundId: string }).refundId;
      try {
        let runtime;
        try {
          runtime = await approveRefund(request.principal!, refundId);
        } catch (error) {
          if (!(error instanceof Error) || error.message !== "REFUND_NOT_AWAITING_APPROVAL") {
            throw error;
          }
          runtime = await getApprovedRefundRuntime(request.principal!, refundId);
        }

        const claim = await claimRefundDispatch(request.principal!, refundId);
        if (!claim.claimed) {
          const inProgress = claim.dispatchState === "DISPATCHING";
          return reply.code(inProgress ? 202 : 200).send({
            data: {
              refundId,
              idempotentReplay: true,
              dispatchState: claim.dispatchState,
              refundStatus: claim.refundStatus,
              inProgress
            }
          });
        }

        let result: RefundExecutionResult;
        if (runtime.connector.environment !== requiredEnvironment) {
          result = {
            outcome: "FAILED",
            error: `CONNECTOR_ENVIRONMENT_MISMATCH:${runtime.connector.environment}:${requiredEnvironment}`
          };
        } else if (
          !(await connectorHasCapability(
            request.principal!,
            runtime.connector.id,
            "refund.create"
          ))
        ) {
          result = {
            outcome: "FAILED",
            error: "CONNECTOR_CAPABILITY_REFUND_CREATE_NOT_ENABLED"
          };
        } else {
          result = await executeRefundSafely(
            runtime.providerType,
            runtime.connector,
            secrets,
            {
              transactionId: runtime.transactionId,
              providerTransactionId: runtime.providerTransactionId,
              amount: runtime.amount,
              currency: runtime.currency,
              reason: runtime.reason,
              idempotencyKey: runtime.idempotencyKey
            }
          );
        }

        await recordRefundResult(
          request.principal!,
          runtime.refundId,
          runtime.transactionId,
          result
        );
        await completeRefundDispatch(
          request.principal!,
          runtime.refundId,
          result.outcome
        );

        return reply.code(result.outcome === "FAILED" ? 422 : 202).send({
          data: {
            refundId: runtime.refundId,
            outcome: result.outcome,
            ...(result.outcome === "CONFIRMED"
              ? {
                  providerRefundId: result.response.providerRefundId,
                  status: result.response.status
                }
              : { error: result.error })
          }
        });
      } catch (error) {
        return reply.code(409).send({
          error: "REFUND_APPROVAL_FAILED",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  app.get(
    "/api/v1/refunds",
    { preHandler: [app.authenticate, requirePermission("refund.read")] },
    async (request) => ({ data: await listRefunds(request.principal!, 100) })
  );

  app.post(
    "/api/v1/providers/:providerId/settlements/sync",
    { preHandler: [app.authenticate, requirePermission("settlement.sync")] },
    async (request, reply) => {
      const parsed = z.object({
        from: z.iso.datetime(),
        to: z.iso.datetime()
      }).refine(
        (value) => Date.parse(value.to) > Date.parse(value.from),
        { message: "to must be after from", path: ["to"] }
      ).safeParse(request.query);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues
        });
      }

      try {
        const providerId = (request.params as { providerId: string }).providerId;
        const runtime = await getConnectorRuntimeForCapability(
          request.principal!,
          providerId,
          "settlement.list",
          requiredEnvironment
        );
        const settlements = await fetchProviderSettlements(
          runtime.connector,
          secrets,
          parsed.data.from,
          parsed.data.to
        );
        const count = await upsertSettlementsTenantSafe(
          request.principal!,
          runtime.providerId,
          runtime.connector.id,
          settlements
        );
        return {
          data: {
            synced: count,
            providerId: runtime.providerId,
            connectorId: runtime.connector.id
          }
        };
      } catch (error) {
        return reply.code(409).send({
          error: "SETTLEMENT_SYNC_FAILED",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  app.get(
    "/api/v1/settlements",
    { preHandler: [app.authenticate, requirePermission("settlement.read")] },
    async (request) => ({ data: await listSettlements(request.principal!, 100) })
  );
}
