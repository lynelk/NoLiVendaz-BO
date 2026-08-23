import type { FastifyInstance } from "fastify";
import { EnvironmentSecretResolver } from "@nolivendaz/provider-sdk";
import { createProviderAdapter } from "@nolivendaz/provider-orchestrator";
import { requirePermission } from "../auth.js";
import { getConnectorRuntime,getLatestProviderHealth,recordProviderHealth } from "../repositories/provider-runtime-repository.js";
const secrets=new EnvironmentSecretResolver();
export async function registerProviderHealthRoutes(app:FastifyInstance):Promise<void>{
 app.get("/api/v1/providers/:providerId/health",{preHandler:[app.authenticate,requirePermission("provider.health.read")]},async request=>({data:await getLatestProviderHealth(request.principal!,(request.params as {providerId:string}).providerId)}));
 app.post("/api/v1/connectors/:connectorId/health-check",{preHandler:[app.authenticate,requirePermission("provider.health.check")]},async(request,reply)=>{const {connectorId}=request.params as {connectorId:string};const body=(request.body??{}) as {providerId?:string};if(!body.providerId)return reply.code(400).send({error:"PROVIDER_ID_REQUIRED"});try{const runtime=await getConnectorRuntime(request.principal!,body.providerId,connectorId);const adapter=createProviderAdapter(runtime.providerType,runtime.connector,secrets);const health=await adapter.healthCheck();await recordProviderHealth(request.principal!,runtime,health);return{data:{providerId:runtime.providerId,connectorId,...health}};}catch(error){return reply.code(400).send({error:"HEALTH_CHECK_FAILED",message:error instanceof Error?error.message:"Unknown error"});}});
}
