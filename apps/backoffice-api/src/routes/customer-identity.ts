import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePermission } from "../auth.js";
import { customerServiceAccessPolicy } from "../customer-service-access.js";
import { isSafeIdentityMask } from "../customer-identity-validation.js";
import { verifyIdentitySyncSecret } from "../customer-identity-sync-auth.js";
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
  profileSetupComplete:z.boolean().optional(),
  termsAccepted:z.boolean().optional(),
  identityConfigured:z.boolean().optional(),
  identityConsentAccepted:z.boolean().optional(),
  serviceAccessPolicyVersion:z.string().trim().max(80).nullable().optional(),
  serviceAccessSource:z.enum(["NOLI","CPAY"]).optional(),
  source:z.enum(["NOLI","CPAY"]),
  sourceUpdatedAt:z.iso.datetime()
}).superRefine((value,ctx)=>{
  if(value.identityNumberMask && !isSafeIdentityMask(value.identityNumberMask)){
    ctx.addIssue({code:"custom",message:"Only strongly masked identity values with at most four visible characters may be synchronized."});
  }
  if(value.identityConsentAccepted===true && (!value.consentVersion || !value.consentAcceptedAt)){
    ctx.addIssue({code:"custom",message:"Accepted identity consent requires a consent version and acceptance timestamp."});
  }
});

const capabilityItem=z.object({
  providerCode:z.string().trim().min(1).max(80),
  enabled:z.boolean(),
  supportsSync:z.boolean(),
  supportsAsync:z.boolean(),
  supportedIdentityTypes:z.array(z.string().trim().min(2).max(40).transform(v=>v.toUpperCase())).max(100),
  supportedCountries:z.array(z.string().trim().length(2).transform(v=>v.toUpperCase())).max(250),
  source:z.enum(["CPAY","CONFIG"]),
  sourceReference:z.string().trim().max(255).nullable().optional(),
  sourceUpdatedAt:z.iso.datetime()
});
const capabilitySyncSchema=z.object({capabilities:z.array(capabilityItem).max(100)});

function authorizeSync(request:any,reply:any){
  const auth=verifyIdentitySyncSecret(request.headers["x-noli-identity-sync-secret"]);
  if(!auth.configured){
    reply.code(503).send({error:"IDENTITY_SYNC_NOT_CONFIGURED",message:"Authoritative identity synchronization is disabled until NOLI_IDENTITY_SYNC_SECRET is configured."});
    return false;
  }
  if(!auth.valid){
    reply.code(401).send({error:"IDENTITY_SYNC_UNAUTHORIZED",message:"Authoritative identity synchronization authentication failed."});
    return false;
  }
  return true;
}

function identitySyncError(reply:any,error:unknown){
  const message=error instanceof Error?error.message:'Unknown error';
  if(message==='STALE_IDENTITY_SYNC')return reply.code(409).send({error:'STALE_IDENTITY_SYNC',message:'A newer customer identity state is already stored.'});
  if(message==='CONFLICTING_IDENTITY_SYNC_TIMESTAMP')return reply.code(409).send({error:'CONFLICTING_IDENTITY_SYNC_TIMESTAMP',message:'A different identity event already exists for the same source timestamp.'});
  if(message==='VERIFIED_REQUIRES_AUTHORITATIVE_REFERENCE')return reply.code(400).send({error:'IDENTITY_SYNC_FAILED',message:'VERIFIED identity state requires an authoritative provider reference and verification timestamp.'});
  if(message==='CONFIGURED_IDENTITY_REQUIRES_MASKED_EVIDENCE')return reply.code(400).send({error:'IDENTITY_SYNC_FAILED',message:'Configured identity state requires type, country and a strongly masked identity value.'});
  if(message==='IDENTITY_CONSENT_REQUIRES_EVIDENCE')return reply.code(400).send({error:'IDENTITY_SYNC_FAILED',message:'Accepted identity consent requires versioned timestamped evidence.'});
  return reply.code(409).send({error:'IDENTITY_SYNC_FAILED',message});
}

export async function registerCustomerIdentityRoutes(app:FastifyInstance):Promise<void>{
  app.get('/api/v1/customers',{preHandler:[app.authenticate,requirePermission('customer.read')]},async request=>({data:await repo.listCustomers(request.principal!)}));
  app.get('/api/v1/customers/:customerId/identity',{preHandler:[app.authenticate,requirePermission('customer.identity.read')]},async(request,reply)=>{
    try{return{data:await repo.getCustomerIdentity(request.principal!,(request.params as {customerId:string}).customerId)}}catch{return reply.code(404).send({error:'CUSTOMER_NOT_FOUND'});}
  });
  app.get('/api/v1/customer-identity/service-access-policy',{preHandler:[app.authenticate,requirePermission('customer.read')]},async()=>({data:customerServiceAccessPolicy}));
  app.get('/api/v1/customer-identity/capabilities',{preHandler:[app.authenticate,requirePermission('customer.identity.capability.read')]},async request=>({data:await repo.listIdentityProviderCapabilities(request.principal!)}));

  app.put('/api/v1/customers/identity-sync',{preHandler:[app.authenticate,requirePermission('customer.identity.sync')]},async(request,reply)=>{
    if(!authorizeSync(request,reply))return;
    const parsed=syncSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'VALIDATION_ERROR',issues:parsed.error.issues});
    try{return{data:await repo.syncCustomerIdentity(request.principal!,parsed.data)}}catch(error){return identitySyncError(reply,error);}
  });

  app.put('/api/v1/customer-identity/capabilities-sync',{preHandler:[app.authenticate,requirePermission('customer.identity.capability.sync')]},async(request,reply)=>{
    if(!authorizeSync(request,reply))return;
    const parsed=capabilitySyncSchema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'VALIDATION_ERROR',issues:parsed.error.issues});
    try{return{data:await repo.syncIdentityProviderCapabilities(request.principal!,parsed.data.capabilities)}}catch(error){
      const message=error instanceof Error?error.message:'Unknown error';
      if(message.startsWith('STALE_CAPABILITY_SYNC:'))return reply.code(409).send({error:'STALE_CAPABILITY_SYNC',message});
      if(message.startsWith('CONFLICTING_CAPABILITY_SYNC_TIMESTAMP:'))return reply.code(409).send({error:'CONFLICTING_CAPABILITY_SYNC_TIMESTAMP',message});
      return reply.code(400).send({error:'CAPABILITY_SYNC_FAILED',message});
    }
  });
}
