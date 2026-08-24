import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import { pool } from "@nolivendaz/database";
import { config } from "./config.js";
import { registerAuth } from "./auth.js";
import { registerAuthExchangeRoute } from "./routes/auth-exchange.js";
import { registerObservability } from "./observability.js";
import { registerProviderRoutes } from "./routes/providers.js";
import { registerProviderLifecycleRoutes } from "./routes/provider-lifecycle.js";
import { registerProviderHealthRoutes } from "./routes/provider-health.js";
import { registerTransactionRoutes } from "./routes/transactions.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { registerVendingRoutes } from "./routes/vending.js";
import { registerFinancialRoutes } from "./routes/financial.js";
import { registerReconciliationRoutes } from "./routes/reconciliation.js";
import { registerSupportRoutes } from "./routes/support.js";
import { registerCertificationRoutes } from "./routes/certification.js";
import { registerOperationsRoutes } from "./routes/operations.js";
import { registerRecoveryRoutes } from "./routes/recovery.js";
import { registerOperatorRoutes } from "./routes/operator.js";
import { registerManagementRoutes } from "./routes/management.js";

export async function buildApp() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, requestIdHeader: "x-correlation-id" });
  await app.register(fastifyJwt, { secret: config.JWT_SECRET });
  await registerAuth(app);
  await registerObservability(app);
  await registerAuthExchangeRoute(app);
  app.get("/health", async (_request, reply) => {
    try { await pool.query("SELECT 1"); return { status: "ok", database: "ok", service: "backoffice-api" }; }
    catch (error) { app.log.error({ err: error }, "Database health check failed"); return reply.code(503).send({ status: "degraded", database: "unavailable", service: "backoffice-api" }); }
  });
  app.get("/api/v1/auth/context", { preHandler: [app.authenticate] }, async request => ({ data: request.principal }));
  await registerProviderRoutes(app);
  await registerProviderLifecycleRoutes(app);
  await registerOperatorRoutes(app);
  await registerManagementRoutes(app);
  await registerTransactionRoutes(app);
  await registerProviderHealthRoutes(app);
  await registerWebhookRoutes(app);
  await registerVendingRoutes(app);
  await registerFinancialRoutes(app);
  await registerReconciliationRoutes(app);
  await registerSupportRoutes(app);
  await registerCertificationRoutes(app);
  await registerOperationsRoutes(app);
  await registerRecoveryRoutes(app);
  return app;
}
