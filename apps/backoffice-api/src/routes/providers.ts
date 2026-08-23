import type { FastifyInstance } from "fastify";
import {
  ConnectorCreateInputSchema,
  ProviderCreateInputSchema,
  SetCapabilitiesInputSchema
} from "@nolivendaz/canonical-models";
import { requirePermission } from "../auth.js";
import {
  createConnector,
  createProvider,
  listProviders,
  replaceConnectorCapabilities
} from "../repositories/provider-repository.js";

export async function registerProviderRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get(
    "/api/v1/providers",
    {
      preHandler: [app.authenticate, requirePermission("provider.read")]
    },
    async (request) => {
      return {
        data: await listProviders(request.principal!)
      };
    }
  );

  app.post(
    "/api/v1/providers",
    {
      preHandler: [app.authenticate, requirePermission("provider.create")]
    },
    async (request, reply) => {
      const parsed = ProviderCreateInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues
        });
      }

      try {
        const provider = await createProvider(request.principal!, parsed.data);
        return reply.code(201).send({ data: provider });
      } catch (error) {
        request.log.error({ err: error }, "Provider creation failed");
        return reply.code(400).send({
          error: "PROVIDER_CREATE_FAILED",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  app.post(
    "/api/v1/providers/:providerId/connectors",
    {
      preHandler: [app.authenticate, requirePermission("provider.connector.create")]
    },
    async (request, reply) => {
      const { providerId } = request.params as { providerId: string };
      const parsed = ConnectorCreateInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues
        });
      }

      try {
        const connector = await createConnector(
          request.principal!,
          providerId,
          parsed.data
        );
        return reply.code(201).send({ data: connector });
      } catch (error) {
        request.log.error({ err: error }, "Connector creation failed");
        return reply.code(400).send({
          error: "CONNECTOR_CREATE_FAILED",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );

  app.put(
    "/api/v1/connectors/:connectorId/capabilities",
    {
      preHandler: [
        app.authenticate,
        requirePermission("provider.capability.manage")
      ]
    },
    async (request, reply) => {
      const { connectorId } = request.params as { connectorId: string };
      const parsed = SetCapabilitiesInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "VALIDATION_ERROR",
          issues: parsed.error.issues
        });
      }

      try {
        const capabilities = await replaceConnectorCapabilities(
          request.principal!,
          connectorId,
          parsed.data.capabilities
        );
        return { data: { connectorId, capabilities } };
      } catch (error) {
        request.log.error({ err: error }, "Capability update failed");
        return reply.code(400).send({
          error: "CAPABILITY_UPDATE_FAILED",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  );
}
