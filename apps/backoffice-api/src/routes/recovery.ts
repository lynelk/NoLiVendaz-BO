import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runTenantRecoveryCycle } from "@nolivendaz/recovery-worker";
import { requirePermission } from "../auth.js";

export async function registerRecoveryRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/v1/recovery/run",
    { preHandler: [app.authenticate, requirePermission("recovery.run")] },
    async (request, reply) => {
      const parsed = z.object({
        limit: z.number().int().min(1).max(200).default(25)
      }).safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues
        });
      }
      try {
        return {
          data: await runTenantRecoveryCycle(
            request.principal!.tenantId,
            parsed.data.limit
          )
        };
      } catch (error) {
        request.log.error({ err: error }, "Recovery cycle failed");
        return reply.code(409).send({
          error: "RECOVERY_RUN_FAILED",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );
}
