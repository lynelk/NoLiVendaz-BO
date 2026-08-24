import type { Principal } from "@nolivendaz/canonical-models";
import { withTenantContext } from "@nolivendaz/database";
import { evaluateCustomerServiceAccess } from "../customer-service-access.js";

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

function withServiceAccess(row:Record<string,any>){
  const access=evaluateCustomerServiceAccess({
    profileSetupComplete:Boolean(row.profile_setup_complete),
    termsAccepted:Boolean(row.terms_accepted),
    phoneVerified:Boolean(row.phone_verified_at),
    identityConfigured:Boolean(row.identity_configured),
    identityConsentAccepted:Boolean(row.identity_consent_accepted),
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
    if(input.identityStatus==='VERIFIED' && (!input.identityProviderReference || !input.identityVerifiedAt)){
      throw new Error("VERIFIED_REQUIRES_AUTHORITATIVE_REFERENCE");
    }
    const before=(await c.query(`SELECT * FROM customers WHERE tenant_id=$1 AND external_reference=$2`,[p.tenantId,input.externalReference])).rows[0] as Record<string,any>|undefined;
    const profileSetupComplete=input.profileSetupComplete??Boolean(before?.profile_setup_complete);
    const termsAccepted=input.termsAccepted??Boolean(before?.terms_accepted);
    const identityConfigured=input.identityConfigured??Boolean(before?.identity_configured);
    const identityConsentAccepted=input.identityConsentAccepted??Boolean(before?.identity_consent_accepted);
    const serviceAccessPolicyVersion=input.serviceAccessPolicyVersion??before?.service_access_policy_version??null;
    const serviceAccessSource=input.serviceAccessSource??before?.service_access_source??input.source;

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
        phone=COALESCE(EXCLUDED.phone,customers.phone),
        email=COALESCE(EXCLUDED.email,customers.email),
        display_name=COALESCE(EXCLUDED.display_name,customers.display_name),
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
         OR EXCLUDED.identity_source_updated_at >= customers.identity_source_updated_at
      RETURNING ${safeCustomerSelect}
    `,[
      p.tenantId,input.externalReference,input.phone??null,input.email??null,input.displayName??null,
      input.phoneVerifiedAt??null,input.identityType??null,input.identityCountry??null,
      input.identityNumberMask??null,input.identityStatus,input.identityProvider??null,
      input.identityProviderReference??null,input.identityVerifiedAt??null,input.consentVersion??null,
      input.consentAcceptedAt??null,input.source,input.sourceUpdatedAt,
      profileSetupComplete,termsAccepted,identityConfigured,identityConsentAccepted,
      serviceAccessPolicyVersion,serviceAccessSource
    ]);
    const row=result.rows[0] as Record<string,any>|undefined;
    if(!row)throw new Error("STALE_IDENTITY_SYNC");
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

export async function syncIdentityProviderCapabilities(p:Principal,inputs:IdentityProviderCapabilitySyncInput[]){
  return withTenantContext(context(p),async c=>{
    const results=[] as Array<Record<string,unknown>>;
    for(const input of inputs){
      const before=(await c.query(`SELECT * FROM identity_provider_capabilities WHERE tenant_id=$1 AND provider_code=$2`,[p.tenantId,input.providerCode])).rows[0]??null;
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
        WHERE EXCLUDED.source_updated_at >= identity_provider_capabilities.source_updated_at
        RETURNING id,provider_code,enabled,supports_sync,supports_async,
                  supported_identity_types,supported_countries,source,source_reference,source_updated_at,
                  last_synced_at,created_at,updated_at
      `,[p.tenantId,input.providerCode,input.enabled,input.supportsSync,input.supportsAsync,
          input.supportedIdentityTypes,input.supportedCountries,input.source,input.sourceReference??null,input.sourceUpdatedAt]);
      const row=write.rows[0] as Record<string,unknown>|undefined;
      if(!row)throw new Error(`STALE_CAPABILITY_SYNC:${input.providerCode}`);
      await c.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,before_state,after_state) VALUES($1,$2,'customer.identity.capabilities.sync','identity_provider_capability',$3,$4::jsonb,$5::jsonb)`,[p.tenantId,p.userId,row.id,JSON.stringify(before),JSON.stringify(row)]);
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
