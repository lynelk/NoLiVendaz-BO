import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import { pool } from "@nolivendaz/database";
import { config } from "./config.js";
import { registerAuth } from "./auth.js";
import { registerProviderRoutes } from "./routes/providers.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    },
    requestIdHeader: "x-correlation-id"
  });

  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET
  });

  await registerAuth(app);

  app.get("/health", async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      return {
        status: "ok",
        database: "ok",
        service: "backoffice-api"
      };
    } catch (error) {
      app.log.error({ err: error }, "Database health check failed");
      return reply.code(503).send({
        status: "degraded",
        database: "unavailable",
        service: "backoffice-api"
      });
    }
  });

  app.get(
    "/api/v1/auth/context",
    { preHandler: [app.authenticate] },
    async (request) => ({ data: request.principal })
  );

  await registerProviderRoutes(app);

  return app;
}
