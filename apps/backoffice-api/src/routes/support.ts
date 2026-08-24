import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePermission } from "../auth.js";
import {
  createSupportCase,
  getSupportCase,
  listSupportCases,
  updateSupportCase
} from "../repositories/phase4-repository.js";
import {
  validateSupportAssignee,
  validateSupportCaseLinks
} from "../repositories/phase4-guards-repository.js";

const createSchema = z.object({
  category: z.enum(["TRANSACTION_UNKNOWN","REFUND","SETTLEMENT","PROVIDER","CUSTOMER","OTHER"]),
  priority: z.enum(["LOW","MEDIUM","HIGH","CRITICAL"]).default("MEDIUM"),
  title: z.string().min(3).max(240),
  description: z.string().max(5000).optional(),
  providerId: z.uuid().optional(),
  connectorId: z.uuid().optional(),
  refundId: z.uuid().optional(),
  reconciliationExceptionId: z.uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const updateSchema = z.object({
  status: z.enum(["OPEN","INVESTIGATING","PENDING_PROVIDER","PENDING_CUSTOMER","RESOLVED","CLOSED"]).optional(),
  assignedTo: z.uuid().nullable().optional(),
  note: z.string().max(5000).optional()
}).refine((value) => value.status !== undefined || value.assignedTo !== undefined || value.note !== undefined, {
  message: "At least one support-case change is required"
});

const listSchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

export async function registerSupportRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/v1/transactions/:transactionId/support-cases",
    { preHandler: [app.authenticate, requirePermission("support.create")] },
    async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", issues: parsed.error.issues });
      }
      try {
        const transactionId = (request.params as { transactionId: string }).transactionId;
        await validateSupportCaseLinks(request.principal!, {
          transactionId,
          ...(parsed.data.providerId ? { providerId: parsed.data.providerId } : {}),
          ...(parsed.data.connectorId ? { connectorId: parsed.data.connectorId } : {}),
          ...(parsed.data.refundId ? { refundId: parsed.data.refundId } : {}),
          ...(parsed.data.reconciliationExceptionId
            ? { reconciliationExceptionId: parsed.data.reconciliationExceptionId }
            : {})
        });
        const row = await createSupportCase(request.principal!, {
          category: parsed.data.category,
          priority: parsed.data.priority,
          title: parsed.data.title,
          transactionId,
          source: "MANUAL",
          ...(parsed.data.description ? { description: parsed.data.description } : {}),
          ...(parsed.data.providerId ? { providerId: parsed.data.providerId } : {}),
          ...(parsed.data.connectorId ? { connectorId: parsed.data.connectorId } : {}),
          ...(parsed.data.refundId ? { refundId: parsed.data.refundId } : {}),
          ...(parsed.data.reconciliationExceptionId
            ? { reconciliationExceptionId: parsed.data.reconciliationExceptionId }
            : {}),
          ...(parsed.data.metadata ? { metadata: parsed.data.metadata } : {})
        });
        return reply.code(201).send({ data: row });
      } catch (error) {
        return reply.code(409).send({
          error: "SUPPORT_CASE_CREATE_FAILED",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  app.get(
    "/api/v1/support/cases",
    { preHandler: [app.authenticate, requirePermission("support.read")] },
    async (request, reply) => {
      const parsed = listSchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues
        });
      }
      const query = parsed.data;
      return {
        data: await listSupportCases(request.principal!, {
          limit: query.limit,
          ...(query.status ? { status: query.status } : {}),
          ...(query.priority ? { priority: query.priority } : {})
        })
      };
    }
  );

  app.get(
    "/api/v1/support/cases/:caseId",
    { preHandler: [app.authenticate, requirePermission("support.read")] },
    async (request, reply) => {
      try {
        return {
          data: await getSupportCase(
            request.principal!,
            (request.params as { caseId: string }).caseId
          )
        };
      } catch (error) {
        return reply.code(404).send({
          error: "SUPPORT_CASE_NOT_FOUND",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  app.patch(
    "/api/v1/support/cases/:caseId",
    { preHandler: [app.authenticate, requirePermission("support.update")] },
    async (request, reply) => {
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", issues: parsed.error.issues });
      }
      try {
        await validateSupportAssignee(request.principal!, parsed.data.assignedTo);
        const input = {
          ...(parsed.data.status ? { status: parsed.data.status } : {}),
          ...(parsed.data.assignedTo !== undefined ? { assignedTo: parsed.data.assignedTo } : {}),
          ...(parsed.data.note ? { note: parsed.data.note } : {})
        };
        return {
          data: await updateSupportCase(
            request.principal!,
            (request.params as { caseId: string }).caseId,
            input
          )
        };
      } catch (error) {
        return reply.code(409).send({
          error: "SUPPORT_CASE_UPDATE_FAILED",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );
}
