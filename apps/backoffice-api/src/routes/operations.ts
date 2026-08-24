import type { FastifyInstance } from "fastify";
import { requirePermission } from "../auth.js";
import { getOperationsQueues } from "../repositories/phase4-repository.js";

export async function registerOperationsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/operations/queues",
    { preHandler: [app.authenticate, requirePermission("recovery.read")] },
    async (request) => ({ data: await getOperationsQueues(request.principal!) })
  );
}
