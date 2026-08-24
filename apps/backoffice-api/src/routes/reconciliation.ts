import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePermission } from "../auth.js";
import {
  listReconciliationExceptions,
  runReconciliation
} from "../repositories/phase3-repository.js";
import {
  resolveClearedReconciliationExceptions
} from "../repositories/phase3-safety-repository.js";

export async function registerReconciliationRoutes(
  app: FastifyInstance
): Promise<void> {
  app.post(
    "/api/v1/reconciliation/run",
    {
      preHandler: [app.authenticate, requirePermission("reconciliation.run")]
    },
    async (request, reply) => {
      const parsed = z.object({
        graceMinutes: z.number().int().min(1).max(10080).default(30)
      }).safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues
        });
      }

      const created = await runReconciliation(
        request.principal!,
        parsed.data.graceMinutes
      );
      const resolved = await resolveClearedReconciliationExceptions(
        request.principal!,
        parsed.data.graceMinutes
      );

      return {
        data: {
          created: created.created,
          resolved
        }
      };
    }
  );

  app.get(
    "/api/v1/reconciliation/exceptions",
    {
      preHandler: [app.authenticate, requirePermission("reconciliation.read")]
    },
    async (request) => ({
      data: await listReconciliationExceptions(request.principal!, 200)
    })
  );
}
