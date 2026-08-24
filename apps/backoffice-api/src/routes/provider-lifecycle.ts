import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePermission } from "../auth.js";
import {
  advanceProviderLifecycle,
  setPreproductionConnectorState
} from "../repositories/provider-lifecycle-repository.js";

export async function registerProviderLifecycleRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/v1/providers/:providerId/lifecycle/advance",
    { preHandler: [app.authenticate, requirePermission("provider.lifecycle.manage")] },
    async (request, reply) => {
      const parsed = z.object({
        action: z.enum(["START_DEVELOPMENT","OPEN_SANDBOX"])
      }).safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", issues: parsed.error.issues });
      }
      try {
        return {
          data: await advanceProviderLifecycle(
            request.principal!,
            (request.params as { providerId: string }).providerId,
            parsed.data.action
          )
        };
      } catch (error) {
        return reply.code(409).send({
          error: "PROVIDER_LIFECYCLE_UPDATE_FAILED",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  app.patch(
    "/api/v1/connectors/:connectorId/preproduction-state",
    { preHandler: [app.authenticate, requirePermission("provider.connector.state.manage")] },
    async (request, reply) => {
      const parsed = z.object({
        status: z.enum(["ACTIVE","DISABLED","MAINTENANCE"]),
        enabled: z.boolean()
      }).safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", issues: parsed.error.issues });
      }
      try {
        return {
          data: await setPreproductionConnectorState(
            request.principal!,
            (request.params as { connectorId: string }).connectorId,
            parsed.data
          )
        };
      } catch (error) {
        return reply.code(409).send({
          error: "CONNECTOR_PREPRODUCTION_STATE_UPDATE_FAILED",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );
}
