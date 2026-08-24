import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePermission } from "../auth.js";
import { listReconciliationExceptions,runReconciliation } from "../repositories/phase3-repository.js";
export async function registerReconciliationRoutes(app:FastifyInstance){app.post("/api/v1/reconciliation/run",{preHandler:[app.authenticate,requirePermission("reconciliation.run")]},async(req,reply)=>{const p=z.object({graceMinutes:z.number().int().min(1).max(10080).default(30)}).safeParse(req.body??{});if(!p.success)return reply.code(400).send({error:"VALIDATION_ERROR",issues:p.error.issues});return{data:await runReconciliation(req.principal!,p.data.graceMinutes)};});app.get("/api/v1/reconciliation/exceptions",{preHandler:[app.authenticate,requirePermission("reconciliation.read")]},async req=>({data:await listReconciliationExceptions(req.principal!,200)}));}
