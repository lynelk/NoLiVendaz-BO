import type { FastifyInstance } from "fastify";
import { EnvironmentSecretResolver } from "@nolivendaz/provider-sdk";
import { resolveUnknownTransaction } from "@nolivendaz/provider-orchestrator";
import { requirePermission } from "../auth.js";
import { applyProviderResolution,getTransaction360,getTransactionRuntime,listTransactions } from "../repositories/transaction-repository.js";

const secrets=new EnvironmentSecretResolver();
export async function registerTransactionRoutes(app:FastifyInstance):Promise<void>{
 app.get("/api/v1/transactions",{preHandler:[app.authenticate,requirePermission("transaction.read")]},async request=>{const q=request.query as {status?:string;providerId?:string;limit?:string};return{data:await listTransactions(request.principal!,{...(q.status?{status:q.status}:{}),...(q.providerId?{providerId:q.providerId}:{}),limit:Math.min(Math.max(Number(q.limit ?? 100),1),500)})};});
 app.get("/api/v1/transactions/:transactionId",{preHandler:[app.authenticate,requirePermission("transaction.read")]},async(request,reply)=>{try{return{data:await getTransaction360(request.principal!,(request.params as {transactionId:string}).transactionId)}}catch(error){return reply.code(404).send({error:"TRANSACTION_NOT_FOUND",message:error instanceof Error?error.message:"Unknown error"});}});
 app.get("/api/v1/transactions/:transactionId/timeline",{preHandler:[app.authenticate,requirePermission("transaction.read")]},async(request,reply)=>{try{const data=await getTransaction360(request.principal!,(request.params as {transactionId:string}).transactionId);return{data:data.timeline};}catch(error){return reply.code(404).send({error:"TRANSACTION_NOT_FOUND"});}});
 app.post("/api/v1/transactions/:transactionId/query-provider",{preHandler:[app.authenticate,requirePermission("transaction.query_provider")]},async(request,reply)=>{const id=(request.params as {transactionId:string}).transactionId;try{const runtime=await getTransactionRuntime(request.principal!,id);const resolution=await resolveUnknownTransaction(runtime,secrets);await applyProviderResolution(request.principal!,id,resolution);return{data:{transactionId:id,...resolution}};}catch(error){request.log.warn({err:error,transactionId:id},"Provider transaction query failed");return reply.code(409).send({error:"PROVIDER_QUERY_FAILED",message:error instanceof Error?error.message:"Unknown error"});}});
}
