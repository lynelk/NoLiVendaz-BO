import type { Principal } from "@nolivendaz/canonical-models";
import { withTenantContext } from "@nolivendaz/database";
import { evaluateCustomerServiceAccess } from "../customer-service-access.js";
import { isSafeIdentityMask } from "../customer-identity-validation.js";

const context=(p:Principal)=>({tenantId:p.tenantId,isPlatformAdmin:p.isPlatformAdmin,userId:p.userId});

export type IdentitySyncInput={
  externalReference:string;
  phone?:string|null|undefined;
  email?:string|null|undefined;
  displayName?:string|null|undefined;
  phoneVerifiedAt?:string|null|undefined;
  identityType?:string|null|undefined;
  identityCountry?:string|null|undefined;
  identityNumberMask?:string|null|undefined;
  identityStatus:"NOT_SUBMITTED"|"FORMAT_VALID"|"VERIFICATION_PENDING"|"VERIFIED"|"VERIFICATION_FAILED"|"REVIEW_REQUIRED";
  identityProvider?:string|null|undefined;
  identityProviderReference?:string|null|undefined;
  identityVerifiedAt?:string|null|undefined;
  consentVersion?:string|null|undefined;
  consentAcceptedAt?:string|null|undefined;
  profileSetupComplete?:boolean|undefined;
  termsAccepted?:boolean|undefined;
  identityConfigured?:boolean|undefined;
  identityConsentAccepted?:boolean|undefined;
  serviceAccessPolicyVersion?:string|null|undefined;
  serviceAccessSource?:"NOLI"|"CPAY"|undefined;
  source:"NOLI"|"CPAY";
  sourceUpdatedAt:string;
};

export type IdentityProviderCapabilitySyncInput={
  providerCode:string;
  enabled:boolean;
  supportsSync:boolean;
  supportsAsync:boolean;
  supportedIdentityTypes:string[];
  supportedCountries:string[];
  source:"CPAY"|"CONFIG";
  sourceReference?:string|null|undefined;
  sourceUpdatedAt:string;
};

const safeCustomerSelect=`
  id,external_reference,phone,email,display_name,status,phone_verified_at,
  identity_type,identity_country,identity_number_mask,identity_status,
  identity_provider,identity_provider_reference,identity_verified_at,
  consent_version,consent_accepted_at,identity_source,identity_source_updated_at,identity_last_synced_at,
  profile_setup_complete,terms_accepted,identity_configured,identity_consent_accepted,
  service_access_policy_version,service_access_source,service_access_synced_at,
  created_at,updated_at
`;

function hasText(value:unknown):boolean{return typeof value==="string"&&value.trim().length>0;}
function timeMs(value:unknown):number|null{
  if(value===null||value===undefined||value==="")return null;
  const millis=new Date(value as string|number|Date).getTime();
  return Number.isFinite(millis)?millis:null;
}
function sameNullable(a:unknown,b:unknown):boolean{return (a??null)===(b??null);}
function sameTime(a:unknown,b:unknown):boolean{return timeMs(a)===timeMs(b);}
function sameStringArray(a:unknown,b:string[]):boolean{
  const left=Array.isArray(a)?a.map(String).sort():[];
  const right=[...b].map(String).sort();
  return left.length===right.length&&left.every((value,index)=>value===right[index]);
}

function withServiceAccess(row:Record<string,any>){
  const configuredEvidence=Boolean(
    row.identity_configured
    && hasText(row.identity_type)
    && hasText(row.identity_country)
    && hasText(row.identity_number_mask)
    && isSafeIdentityMask(String(row.identity_number_mask))
  );
  const consentEvidence=Boolean(
    row.identity_consent_accepted
    && hasText(row.consent_version)
    && timeMs(row.consent_accepted_at)!==null
  );
  const access=evaluateCustomerServiceAccess({
    profileSetupComplete:Boolean(row.profile_setup_complete),
    termsAccepted:Boolean(row.terms_accepted),
    phoneVerified:Boolean(row.phone_verified_at),
    identityConfigured:configuredEvidence,
    identityConsentAccepted:consentEvidence,
    identityStatus:String(row.identity_status??"NOT_SUBMITTED")
  });
  return {
    ...row,
    protected_service_access:access.state,
    protected_service_allowed:access.allowed,
    protected_service_missing:access.missing,
    protected_service:access.service
  };
}

function effectiveCustomerSync(before:Record<string,any>|undefined,input:IdentitySyncInput){
  const preserve=<T>(incoming:T|undefined,existing:T|null|undefined):T|null=>incoming===undefined?(existing??null):incoming;
  return {
    phone:preserve(input.phone,before?.phone),
    email:preserve(input.email,before?.email),
    displayName:preserve(input.displayName,before?.display_name),
    phoneVerifiedAt:preserve(input.phoneVerifiedAt,before?.phone_verified_at),
    identityType:preserve(input.identityType,before?.identity_type),
    identityCountry:preserve(input.identityCountry,before?.identity_country),
    identityNumberMask:preserve(input.identityNumberMask,before?.identity_number_mask),
    identityStatus:input.identityStatus,
    identityProvider:preserve(input.identityProvider,before?.identity_provider),
    identityProviderReference:preserve(input.identityProviderReference,before?.identity_provider_reference),
    identityVerifiedAt:preserve(input.identityVerifiedAt,before?.identity_verified_at),
    consentVersion:preserve(input.consentVersion,before?.consent_version),
    consentAcceptedAt:preserve(input.consentAcceptedAt,before?.consent_accepted_at),
    profileSetupComplete:input.profileSetupComplete===undefined?Boolean(before?.profile_setup_complete):input.profileSetupComplete,
    termsAccepted:input.termsAccepted===undefined?Boolean(before?.terms_accepted):input.termsAccepted,
    identityConfigured:input.identityConfigured===undefined?Boolean(before?.identity_configured):input.identityConfigured,
    identityConsentAccepted:input.identityConsentAccepted===undefined?Boolean(before?.identity_consent_accepted):input.identityConsentAccepted,
    serviceAccessPolicyVersion:input.serviceAccessPolicyVersion===undefined?(before?.service_access_policy_version??null):input.serviceAccessPolicyVersion,
    serviceAccessSource:input.serviceAccessSource===undefined?(before?.service_access_source??input.source):input.serviceAccessSource,
    source:input.source,
    sourceUpdatedAt:input.sourceUpdatedAt
  };
}

function validateEffectiveCustomerSync(state:ReturnType<typeof effectiveCustomerSync>){
  if(state.identityStatus==="VERIFIED"&&(!hasText(state.identityProviderReference)||timeMs(state.identityVerifiedAt)===null)){
    throw new Error("VERIFIED_REQUIRES_AUTHORITATIVE_REFERENCE");
  }
  if(state.identityConfigured&&(
    !hasText(state.identityType)
    ||!hasText(state.identityCountry)
    ||!hasText(state.identityNumberMask)
    ||!isSafeIdentityMask(String(state.identityNumberMask))
  )){
    throw new Error("CONFIGURED_IDENTITY_REQUIRES_MASKED_EVIDENCE");
  }
  if(state.identityConsentAccepted&&(!hasText(state.consentVersion)||timeMs(state.consentAcceptedAt)===null)){
    throw new Error("IDENTITY_CONSENT_REQUIRES_EVIDENCE");
  }
}

function sameCustomerSync(before:Record<string,any>,state:ReturnType<typeof effectiveCustomerSync>):boolean{
  return sameNullable(before.phone,state.phone)
    &&sameNullable(before.email,state.email)
    &&sameNullable(before.display_name,state.displayName)
    &&sameTime(before.phone_verified_at,state.phoneVerifiedAt)
    &&sameNullable(before.identity_type,state.identityType)
    &&sameNullable(before.identity_country,state.identityCountry)
    &&sameNullable(before.identity_number_mask,state.identityNumberMask)
    &&sameNullable(before.identity_status,state.identityStatus)
    &&sameNullable(before.identity_provider,state.identityProvider)
    &&sameNullable(before.identity_provider_reference,state.identityProviderReference)
    &&sameTime(before.identity_verified_at,state.identityVerifiedAt)
    &&sameNullable(before.consent_version,state.consentVersion)
    &&sameTime(before.consent_accepted_at,state.consentAcceptedAt)
    &&Boolean(before.profile_setup_complete)===state.profileSetupComplete
    &&Boolean(before.terms_accepted)===state.termsAccepted
    &&Boolean(before.identity_configured)===state.identityConfigured
    &&Boolean(before.identity_consent_accepted)===state.identityConsentAccepted
    &&sameNullable(before.service_access_policy_version,state.serviceAccessPolicyVersion)
    &&sameNullable(before.service_access_source,state.serviceAccessSource)
    &&sameNullable(before.identity_source,state.source)
    &&sameTime(before.identity_source_updated_at,state.sourceUpdatedAt);
}

export async function listCustomers(p:Principal){
  return withTenantContext(context(p),async c=>{
    const rows=(await c.query(`
      SELECT ${safeCustomerSelect}
        FROM customers
       WHERE tenant_id=$1
       ORDER BY
         CASE identity_status WHEN 'REVIEW_REQUIRED' THEN 0 WHEN 'VERIFICATION_FAILED' THEN 1 WHEN 'VERIFICATION_PENDING' THEN 2 ELSE 3 END,
         updated_at DESC
       LIMIT 1000
    `,[p.tenantId])).rows as Array<Record<string,any>>;
    return rows.map(withServiceAccess);
  });
}

export async function getCustomerIdentity(p:Principal,id:string){
  return withTenantContext(context(p),async c=>{
    const row=(await c.query(`SELECT ${safeCustomerSelect} FROM customers WHERE tenant_id=$1 AND id=$2`,[p.tenantId,id])).rows[0] as Record<string,any>|undefined;
    if(!row)throw new Error("CUSTOMER_NOT_FOUND");
    return withServiceAccess(row);
  });
}

export async function syncCustomerIdentity(p:Principal,input:IdentitySyncInput){
  return withTenantContext(context(p),async c=>{
    const before=(await c.query(`SELECT * FROM customers WHERE tenant_id=$1 AND external_reference=$2`,[p.tenantId,input.externalReference])).rows[0] as Record<string,any>|undefined;
    const effective=effectiveCustomerSync(before,input);
    validateEffectiveCustomerSync(effective);

    const beforeEventTime=timeMs(before?.identity_source_updated_at);
    const incomingEventTime=timeMs(input.sourceUpdatedAt);
    if(incomingEventTime===null)throw new Error("INVALID_SOURCE_UPDATED_AT");
    if(beforeEventTime!==null){
      if(incomingEventTime<beforeEventTime)throw new Error("STALE_IDENTITY_SYNC");
      if(incomingEventTime===beforeEventTime){
        if(before&&sameCustomerSync(before,effective))return withServiceAccess(before);
        throw new Error("CONFLICTING_IDENTITY_SYNC_TIMESTAMP");
      }
    }

    const result=await c.query(`
      INSERT INTO customers(
        tenant_id,external_reference,phone,email,display_name,phone_verified_at,
        identity_type,identity_country,identity_number_mask,identity_status,
        identity_provider,identity_provider_reference,identity_verified_at,
        consent_version,consent_accepted_at,identity_source,identity_source_updated_at,identity_last_synced_at,
        profile_setup_complete,terms_accepted,identity_configured,identity_consent_accepted,
        service_access_policy_version,service_access_source,service_access_synced_at
      ) VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now(),
        $18,$19,$20,$21,$22,$23,now()
      )
      ON CONFLICT (tenant_id,external_reference) DO UPDATE SET
        phone=EXCLUDED.phone,
        email=EXCLUDED.email,
        display_name=EXCLUDED.display_name,
        phone_verified_at=EXCLUDED.phone_verified_at,
        identity_type=EXCLUDED.identity_type,
        identity_country=EXCLUDED.identity_country,
        identity_number_mask=EXCLUDED.identity_number_mask,
        identity_status=EXCLUDED.identity_status,
        identity_provider=EXCLUDED.identity_provider,
        identity_provider_reference=EXCLUDED.identity_provider_reference,
        identity_verified_at=EXCLUDED.identity_verified_at,
        consent_version=EXCLUDED.consent_version,
        consent_accepted_at=EXCLUDED.consent_accepted_at,
        identity_source=EXCLUDED.identity_source,
        identity_source_updated_at=EXCLUDED.identity_source_updated_at,
        identity_last_synced_at=now(),
        profile_setup_complete=EXCLUDED.profile_setup_complete,
        terms_accepted=EXCLUDED.terms_accepted,
        identity_configured=EXCLUDED.identity_configured,
        identity_consent_accepted=EXCLUDED.identity_consent_accepted,
        service_access_policy_version=EXCLUDED.service_access_policy_version,
        service_access_source=EXCLUDED.service_access_source,
        service_access_synced_at=now(),
        updated_at=now()
      WHERE customers.identity_source_updated_at IS NULL
         OR EXCLUDED.identity_source_updated_at > customers.identity_source_updated_at
      RETURNING ${safeCustomerSelect}
    `,[
      p.tenantId,input.externalReference,effective.phone,effective.email,effective.displayName,
      effective.phoneVerifiedAt,effective.identityType,effective.identityCountry,
      effective.identityNumberMask,effective.identityStatus,effective.identityProvider,
      effective.identityProviderReference,effective.identityVerifiedAt,effective.consentVersion,
      effective.consentAcceptedAt,effective.source,effective.sourceUpdatedAt,
      effective.profileSetupComplete,effective.termsAccepted,effective.identityConfigured,effective.identityConsentAccepted,
      effective.serviceAccessPolicyVersion,effective.serviceAccessSource
    ]);
    let row=result.rows[0] as Record<string,any>|undefined;
    if(!row){
      const current=(await c.query(`SELECT ${safeCustomerSelect} FROM customers WHERE tenant_id=$1 AND external_reference=$2`,[p.tenantId,input.externalReference])).rows[0] as Record<string,any>|undefined;
      if(current&&timeMs(current.identity_source_updated_at)===incomingEventTime&&sameCustomerSync(current,effective))return withServiceAccess(current);
      if(current&&timeMs(current.identity_source_updated_at)===incomingEventTime)throw new Error("CONFLICTING_IDENTITY_SYNC_TIMESTAMP");
      throw new Error("STALE_IDENTITY_SYNC");
    }
    await c.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,before_state,after_state) VALUES($1,$2,'customer.identity.sync','customer',$3,$4::jsonb,$5::jsonb)`,[p.tenantId,p.userId,row.id,JSON.stringify(maskForAudit(before??null)),JSON.stringify(maskForAudit(row))]);
    return withServiceAccess(row);
  });
}

export async function listIdentityProviderCapabilities(p:Principal){
  return withTenantContext(context(p),async c=>(await c.query(`
    SELECT id,provider_code,enabled,supports_sync,supports_async,
           supported_identity_types,supported_countries,source,source_reference,source_updated_at,
           last_synced_at,created_at,updated_at
      FROM identity_provider_capabilities
     WHERE tenant_id=$1
     ORDER BY enabled DESC,provider_code ASC
  `,[p.tenantId])).rows);
}

function sameCapability(before:Record<string,any>,input:IdentityProviderCapabilitySyncInput):boolean{
  return Boolean(before.enabled)===input.enabled
    &&Boolean(before.supports_sync)===input.supportsSync
    &&Boolean(before.supports_async)===input.supportsAsync
    &&sameStringArray(before.supported_identity_types,input.supportedIdentityTypes)
    &&sameStringArray(before.supported_countries,input.supportedCountries)
    &&sameNullable(before.source,input.source)
    &&sameNullable(before.source_reference,input.sourceReference??null)
    &&sameTime(before.source_updated_at,input.sourceUpdatedAt);
}

export async function syncIdentityProviderCapabilities(p:Principal,inputs:IdentityProviderCapabilitySyncInput[]){
  return withTenantContext(context(p),async c=>{
    const results=[] as Array<Record<string,unknown>>;
    for(const input of inputs){
      const before=(await c.query(`SELECT * FROM identity_provider_capabilities WHERE tenant_id=$1 AND provider_code=$2`,[p.tenantId,input.providerCode])).rows[0] as Record<string,any>|undefined;
      const beforeTime=timeMs(before?.source_updated_at);
      const incomingTime=timeMs(input.sourceUpdatedAt);
      if(incomingTime===null)throw new Error(`INVALID_CAPABILITY_SOURCE_UPDATED_AT:${input.providerCode}`);
      if(beforeTime!==null){
        if(incomingTime<beforeTime)throw new Error(`STALE_CAPABILITY_SYNC:${input.providerCode}`);
        if(incomingTime===beforeTime){
          if(before&&sameCapability(before,input)){results.push(before);continue;}
          throw new Error(`CONFLICTING_CAPABILITY_SYNC_TIMESTAMP:${input.providerCode}`);
        }
      }

      const write=await c.query(`
        INSERT INTO identity_provider_capabilities(
          tenant_id,provider_code,enabled,supports_sync,supports_async,
          supported_identity_types,supported_countries,source,source_reference,source_updated_at,last_synced_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
        ON CONFLICT (tenant_id,provider_code) DO UPDATE SET
          enabled=EXCLUDED.enabled,
          supports_sync=EXCLUDED.supports_sync,
          supports_async=EXCLUDED.supports_async,
          supported_identity_types=EXCLUDED.supported_identity_types,
          supported_countries=EXCLUDED.supported_countries,
          source=EXCLUDED.source,
          source_reference=EXCLUDED.source_reference,
          source_updated_at=EXCLUDED.source_updated_at,
          last_synced_at=now(),
          updated_at=now()
        WHERE EXCLUDED.source_updated_at > identity_provider_capabilities.source_updated_at
        RETURNING id,provider_code,enabled,supports_sync,supports_async,
                  supported_identity_types,supported_countries,source,source_reference,source_updated_at,
                  last_synced_at,created_at,updated_at
      `,[p.tenantId,input.providerCode,input.enabled,input.supportsSync,input.supportsAsync,
          input.supportedIdentityTypes,input.supportedCountries,input.source,input.sourceReference??null,input.sourceUpdatedAt]);
      let row=write.rows[0] as Record<string,any>|undefined;
      if(!row){
        const current=(await c.query(`SELECT * FROM identity_provider_capabilities WHERE tenant_id=$1 AND provider_code=$2`,[p.tenantId,input.providerCode])).rows[0] as Record<string,any>|undefined;
        if(current&&timeMs(current.source_updated_at)===incomingTime&&sameCapability(current,input)){results.push(current);continue;}
        if(current&&timeMs(current.source_updated_at)===incomingTime)throw new Error(`CONFLICTING_CAPABILITY_SYNC_TIMESTAMP:${input.providerCode}`);
        throw new Error(`STALE_CAPABILITY_SYNC:${input.providerCode}`);
      }
      await c.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,before_state,after_state) VALUES($1,$2,'customer.identity.capabilities.sync','identity_provider_capability',$3,$4::jsonb,$5::jsonb)`,[p.tenantId,p.userId,row.id,JSON.stringify(before??null),JSON.stringify(row)]);
      results.push(row);
    }
    return results;
  });
}

function maskForAudit(row:Record<string,any>|null){
  if(!row)return null;
  const {metadata,...safe}=row;
  return {...safe,metadata:metadata?{present:true}:undefined};
}
