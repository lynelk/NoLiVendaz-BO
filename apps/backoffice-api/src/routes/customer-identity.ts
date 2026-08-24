import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePermission } from "../auth.js";
import * as repo from "../repositories/customer-identity-repository.js";

const status=z.enum(["NOT_SUBMITTED","FORMAT_VALID","VERIFICATION_PENDING","VERIFIED","VERIFICATION_FAILED","REVIEW_REQUIRED"]);
const syncSchema=z.object({
  externalReference:z.string().trim().min(1).max(160),
  phone:z.string().trim().max(40).nullable().optional(),
  email:z.string().email().max(320).nullable().optional(),
  displayName:z.string().trim().max(200).nullable().optional(),
  phoneVerifiedAt:z.iso.datetime().nullable().optional(),
  identityType:z.string().trim().min(2).max(40).transform(v=>v.toUpperCase()).nullable().optional(),
  identityCountry:z.string().trim().length(2).transform(v=>v.toUpperCase()).nullable().optional(),
  identityNumberMask:z.string().trim().max(64).nullable().optional(),
  identityStatus:status,
  identityProvider:z.string().trim().max(80).nullable().optional(),
  identityProviderReference:z.string().trim().max(255).nullable().optional(),
  identityVerifiedAt:z.iso.datetime().nullable().optional(),
  consentVersion:z.string().trim().max(80).nullable().optional(),
  consentAcceptedAt:z.iso.datetime().nullable().optional(),
  source:z.enum(["NOLI","CPAY"])
}).superRefine((value,ctx)=>{
  if(value.identityStatus==="VERIFIED" && (!value.identityProviderReference || !value.identityVerifiedAt)){
    ctx.addIssue({code:"custom",message:"VERIFIED identity state requires an authoritative provider reference and verification timestamp."});
  }
  if(value.identityNumberMask && /[A-Z0-9]{8,}/i.test(value.identityNumberMask.replace(/\*/g,""))){
    ctx.addIssue({code:"custom",message:"Only masked identity values may be synchronized."});
  }
});

export async function registerCustomerIdentityRoutes(app:FastifyInstance):Promise<void>{
  app.get('/api/v1/customers',{preHandler:[app.authenticate,requirePermission('customer.read')]},async request=>({data:await repo.listCustomers(request.principal!)}));
  app.get('/api/v1/customers/:customerId/identity',{preHandler:[app.authenticate,requirePermission('customer.identity.read')]},async(request,reply)=>{
    try{return{data:await repo.getCustomerIdentity(request.principal!,(request.params as {customerId:string}).customerId)}}catch{return reply.code(404).send({error:'CUSTOMER_NOT_FOUND'});}
  });
  app.put('/api/v1/customers/identity-sync',{preHandler:[app.authenticate,requirePermission('customer.identity.sync')]},async(request,reply)=>{
    const parsed=syncSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'VALIDATION_ERROR',issues:parsed.error.issues});
    try{return{data:await repo.syncCustomerIdentity(request.principal!,parsed.data)}}catch(error){
      const message=error instanceof Error?error.message:'Unknown error';
      return reply.code(message==='VERIFIED_REQUIRES_AUTHORITATIVE_REFERENCE'?400:409).send({error:'IDENTITY_SYNC_FAILED',message});
    }
  });
}
