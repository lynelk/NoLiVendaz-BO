import type { Principal } from "@nolivendaz/canonical-models";
import { withTenantContext } from "@nolivendaz/database";

const context=(p:Principal)=>({tenantId:p.tenantId,isPlatformAdmin:p.isPlatformAdmin,userId:p.userId});

export type IdentitySyncInput={
  externalReference:string;
  phone?:string|null;
  email?:string|null;
  displayName?:string|null;
  phoneVerifiedAt?:string|null;
  identityType?:string|null;
  identityCountry?:string|null;
  identityNumberMask?:string|null;
  identityStatus:"NOT_SUBMITTED"|"FORMAT_VALID"|"VERIFICATION_PENDING"|"VERIFIED"|"VERIFICATION_FAILED"|"REVIEW_REQUIRED";
  identityProvider?:string|null;
  identityProviderReference?:string|null;
  identityVerifiedAt?:string|null;
  consentVersion?:string|null;
  consentAcceptedAt?:string|null;
  source:"NOLI"|"CPAY";
};

export async function listCustomers(p:Principal){
  return withTenantContext(context(p),async c=>(await c.query(`
    SELECT id,external_reference,phone,email,display_name,status,phone_verified_at,
           identity_type,identity_country,identity_number_mask,identity_status,
           identity_provider,identity_provider_reference,identity_verified_at,
           consent_version,consent_accepted_at,identity_source,identity_last_synced_at,
           CASE
             WHEN phone_verified_at IS NULL THEN 'PHONE_REQUIRED'
             WHEN identity_status <> 'VERIFIED' THEN 'IDENTITY_REQUIRED'
             ELSE 'READY'
           END AS protected_service_access,
           created_at,updated_at
      FROM customers
     ORDER BY
       CASE identity_status WHEN 'REVIEW_REQUIRED' THEN 0 WHEN 'VERIFICATION_FAILED' THEN 1 WHEN 'VERIFICATION_PENDING' THEN 2 ELSE 3 END,
       updated_at DESC
     LIMIT 1000
  `)).rows);
}

export async function getCustomerIdentity(p:Principal,id:string){
  return withTenantContext(context(p),async c=>{
    const row=(await c.query(`
      SELECT id,external_reference,phone,email,display_name,status,phone_verified_at,
             identity_type,identity_country,identity_number_mask,identity_status,
             identity_provider,identity_provider_reference,identity_verified_at,
             consent_version,consent_accepted_at,identity_source,identity_last_synced_at,
             CASE
               WHEN phone_verified_at IS NULL THEN 'PHONE_REQUIRED'
               WHEN identity_status <> 'VERIFIED' THEN 'IDENTITY_REQUIRED'
               ELSE 'READY'
             END AS protected_service_access,
             created_at,updated_at
        FROM customers WHERE id=$1
    `,[id])).rows[0];
    if(!row)throw new Error("CUSTOMER_NOT_FOUND");
    return row;
  });
}

export async function syncCustomerIdentity(p:Principal,input:IdentitySyncInput){
  return withTenantContext(context(p),async c=>{
    if(input.identityStatus==='VERIFIED' && (!input.identityProviderReference || !input.identityVerifiedAt)){
      throw new Error("VERIFIED_REQUIRES_AUTHORITATIVE_REFERENCE");
    }
    const before=(await c.query(`SELECT * FROM customers WHERE external_reference=$1`,[input.externalReference])).rows[0]??null;
    const row=(await c.query(`
      INSERT INTO customers(
        tenant_id,external_reference,phone,email,display_name,phone_verified_at,
        identity_type,identity_country,identity_number_mask,identity_status,
        identity_provider,identity_provider_reference,identity_verified_at,
        consent_version,consent_accepted_at,identity_source,identity_last_synced_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now())
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
        identity_last_synced_at=now(),
        updated_at=now()
      RETURNING *
    `,[
      p.tenantId,input.externalReference,input.phone??null,input.email??null,input.displayName??null,
      input.phoneVerifiedAt??null,input.identityType??null,input.identityCountry??null,
      input.identityNumberMask??null,input.identityStatus,input.identityProvider??null,
      input.identityProviderReference??null,input.identityVerifiedAt??null,input.consentVersion??null,
      input.consentAcceptedAt??null,input.source
    ])).rows[0];
    await c.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,before_state,after_state) VALUES($1,$2,'customer.identity.sync','customer',$3,$4::jsonb,$5::jsonb)`,[p.tenantId,p.userId,row.id,JSON.stringify(maskForAudit(before)),JSON.stringify(maskForAudit(row))]);
    return row;
  });
}

function maskForAudit(row:any){
  if(!row)return null;
  const {metadata,...safe}=row;
  return {...safe,metadata:metadata?{present:true}:undefined};
}
