import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ConnectorEnvironmentSchema } from "@nolivendaz/canonical-models";
import { EnvironmentSecretResolver } from "@nolivendaz/provider-sdk";
import { executeVendSafely } from "@nolivendaz/provider-orchestrator";
import { requirePermission } from "../auth.js";
import {
  prepareRoutedVend,
  recordVendResult
} from "../repositories/phase3-repository.js";
import {
  claimVendDispatch,
  completeVendDispatch,
  validateVendInput
} from "../repositories/phase3-safety-repository.js";

const schema = z.object({
  merchantId: z.uuid(),
  serviceId: z.uuid(),
  productId: z.uuid().optional(),
  siteId: z.uuid().optional(),
  amount: z.string()
    .regex(/^\d+(\.\d{1,6})?$/)
    .refine((value) => Number(value) > 0, "Amount must be greater than zero"),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  paymentReference: z.string().min(3).max(200),
  idempotencyKey: z.string().min(8).max(200),
  correlationId: z.uuid().optional(),
  customerReference: z.string().max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const secrets = new EnvironmentSecretResolver();
const environmentResult = ConnectorEnvironmentSchema.safeParse(
  (process.env.PROVIDER_RUNTIME_ENV ?? "PRODUCTION").toUpperCase()
);
if (!environmentResult.success) throw new Error("INVALID_PROVIDER_RUNTIME_ENV");
const requiredEnvironment = environmentResult.data;

export async function registerVendingRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/v1/vends",
    {
      preHandler: [app.authenticate, requirePermission("transaction.initiate")]
    },
    async (request, reply) => {
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues
        });
      }

      try {
        const input = {
          ...parsed.data,
          correlationId: parsed.data.correlationId ?? randomUUID(),
          environment: requiredEnvironment
        };

        await validateVendInput(request.principal!, {
          merchantId: input.merchantId,
          serviceId: input.serviceId,
          amount: input.amount,
          currency: input.currency,
          ...(input.productId ? { productId: input.productId } : {}),
          ...(input.siteId ? { siteId: input.siteId } : {})
        });

        const routed = await prepareRoutedVend(request.principal!, input);
        const claim = await claimVendDispatch(
          request.principal!,
          routed.transactionId
        );

        if (!claim.claimed) {
          const inProgress = claim.dispatchState === "DISPATCHING";
          return reply.code(inProgress ? 202 : 200).send({
            data: {
              transactionId: routed.transactionId,
              reference: routed.reference,
              idempotentReplay: true,
              dispatchState: claim.dispatchState,
              transactionStatus: claim.transactionStatus,
              inProgress
            }
          });
        }

        if (routed.connector.environment !== requiredEnvironment) {
          const result = {
            outcome: "FAILED" as const,
            error: `CONNECTOR_ENVIRONMENT_MISMATCH:${routed.connector.environment}:${requiredEnvironment}`
          };
          await recordVendResult(request.principal!, routed.transactionId, result);
          await completeVendDispatch(
            request.principal!,
            routed.transactionId,
            result.outcome
          );
          return reply.code(409).send({
            error: "CONNECTOR_ENVIRONMENT_MISMATCH",
            transactionId: routed.transactionId,
            requiredEnvironment,
            selectedEnvironment: routed.connector.environment
          });
        }

        const providerMetadata = {
          ...(input.metadata ?? {}),
          ...(routed.providerMerchantId
            ? { providerMerchantId: routed.providerMerchantId }
            : {}),
          ...(routed.providerSiteId
            ? { providerSiteId: routed.providerSiteId }
            : {})
        };

        const result = await executeVendSafely(
          routed.providerType,
          routed.connector,
          secrets,
          {
            transactionId: routed.transactionId,
            correlationId: routed.correlationId,
            idempotencyKey: input.idempotencyKey,
            serviceCode: routed.serviceCode,
            ...(routed.productCode ? { productCode: routed.productCode } : {}),
            ...(input.customerReference
              ? { customerReference: input.customerReference }
              : {}),
            amount: input.amount,
            currency: input.currency,
            ...(Object.keys(providerMetadata).length > 0
              ? { metadata: providerMetadata }
              : {})
          }
        );

        await recordVendResult(request.principal!, routed.transactionId, result);
        await completeVendDispatch(
          request.principal!,
          routed.transactionId,
          result.outcome
        );

        return reply.code(result.outcome === "FAILED" ? 422 : 202).send({
          data: {
            transactionId: routed.transactionId,
            reference: routed.reference,
            providerId: routed.providerId,
            routeId: routed.routeId,
            outcome: result.outcome,
            ...(result.outcome === "CONFIRMED"
              ? {
                  providerTransactionId: result.response.providerTransactionId,
                  vendStatus: result.response.status
                }
              : { error: result.error })
          }
        });
      } catch (error) {
        request.log.error({ err: error }, "Routed vend failed");
        return reply.code(409).send({
          error: "VEND_INITIATION_FAILED",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );
}
