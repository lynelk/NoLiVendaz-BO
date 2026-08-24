import type { FastifyInstance } from "fastify";
import { requirePermission } from "../auth.js";
import {
  getConnectorCapabilities,
  listProviderConnectors
} from "../repositories/operator-repository.js";

export async function registerOperatorRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/providers/:providerId/connectors",
    { preHandler: [app.authenticate, requirePermission("provider.read")] },
    async (request, reply) => {
      try {
        return {
          data: await listProviderConnectors(
            request.principal!,
            (request.params as { providerId: string }).providerId
          )
        };
      } catch (error) {
        return reply.code(404).send({
          error: "PROVIDER_CONNECTORS_NOT_FOUND",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  app.get(
    "/api/v1/connectors/:connectorId/capabilities",
    { preHandler: [app.authenticate, requirePermission("provider.read")] },
    async (request, reply) => {
      try {
        return {
          data: await getConnectorCapabilities(
            request.principal!,
            (request.params as { connectorId: string }).connectorId
          )
        };
      } catch (error) {
        return reply.code(404).send({
          error: "CONNECTOR_NOT_FOUND",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );
}
