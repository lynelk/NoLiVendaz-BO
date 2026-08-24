import type { Principal } from "@nolivendaz/canonical-models";
import { withTenantContext } from "@nolivendaz/database";

const context=(p:Principal)=>({tenantId:p.tenantId,isPlatformAdmin:p.isPlatformAdmin,userId:p.userId});
async function audit(c:any,p:Principal,action:string,type:string,id:unknown,state:unknown){await c.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,after_state) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[p.tenantId,p.userId,action,type,id??null,JSON.stringify(state??{})]);}

export async function createDevice(p:Principal,input:{code:string;deviceType:string;merchantId?:string|undefined;siteId?:string|undefined;serialNumber?:string|undefined;providerId?:string|undefined;connectorId?:string|undefined;providerDeviceId?:string|undefined}){
 return withTenantContext(context(p),async c=>{
  if(input.merchantId){const m=await c.query(`SELECT 1 FROM merchants WHERE id=$1 AND tenant_id=$2`,[input.merchantId,p.tenantId]);if(m.rowCount!==1)throw new Error('MERCHANT_NOT_FOUND');}
  if(input.siteId){const s=await c.query(`SELECT 1 FROM sites WHERE id=$1 AND tenant_id=$2 AND ($3::uuid IS NULL OR merchant_id=$3)`,[input.siteId,p.tenantId,input.merchantId??null]);if(s.rowCount!==1)throw new Error('SITE_NOT_FOUND');}
  const d=(await c.query(`INSERT INTO devices(tenant_id,merchant_id,site_id,code,device_type,serial_number) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[p.tenantId,input.merchantId??null,input.siteId??null,input.code,input.deviceType,input.serialNumber??null])).rows[0];
  if(!d)throw new Error('DEVICE_CREATE_FAILED');
  if(input.providerId||input.connectorId||input.providerDeviceId){if(!input.providerId||!input.providerDeviceId)throw new Error('DEVICE_MAPPING_FIELDS_REQUIRED');const visible=await c.query(`SELECT 1 FROM providers WHERE id=$1 AND (scope='PLATFORM' OR tenant_id=$2)`,[input.providerId,p.tenantId]);if(visible.rowCount!==1)throw new Error('PROVIDER_NOT_VISIBLE');if(input.connectorId){const connector=await c.query(`SELECT 1 FROM provider_connectors WHERE id=$1 AND provider_id=$2`,[input.connectorId,input.providerId]);if(connector.rowCount!==1)throw new Error('CONNECTOR_NOT_VISIBLE');}await c.query(`INSERT INTO device_provider_mappings(tenant_id,device_id,provider_id,connector_id,provider_device_id) VALUES($1,$2,$3,$4,$5)`,[p.tenantId,d.id,input.providerId,input.connectorId??null,input.providerDeviceId]);}
  await audit(c,p,'device.create','device',d.id,d);return d;
 });
}

export async function updateIncident(p:Principal,id:string,input:{status?:'OPEN'|'INVESTIGATING'|'MITIGATED'|'RESOLVED'|'CLOSED'|undefined;ownerUserId?:string|null|undefined;summary?:string|undefined}){
 return withTenantContext(context(p),async c=>{
  if(input.ownerUserId){const u=await c.query(`SELECT 1 FROM users WHERE id=$1 AND tenant_id=$2 AND status='ACTIVE'`,[input.ownerUserId,p.tenantId]);if(u.rowCount!==1)throw new Error('INCIDENT_OWNER_NOT_FOUND');}
  const row=(await c.query(`UPDATE incidents SET status=COALESCE($2,status),owner_user_id=CASE WHEN $3::boolean THEN $4::uuid ELSE owner_user_id END,summary=COALESCE($5,summary),mitigated_at=CASE WHEN $2='MITIGATED' THEN COALESCE(mitigated_at,now()) ELSE mitigated_at END,resolved_at=CASE WHEN $2 IN ('RESOLVED','CLOSED') THEN COALESCE(resolved_at,now()) ELSE resolved_at END,updated_at=now() WHERE id=$1 RETURNING *`,[id,input.status??null,Object.prototype.hasOwnProperty.call(input,'ownerUserId'),input.ownerUserId??null,input.summary??null])).rows[0];
  if(!row)throw new Error('INCIDENT_NOT_FOUND');await audit(c,p,'incident.update','incident',id,row);return row;
 });
}

export async function upsertCredentialMetadata(p:Principal,connectorId:string,input:{credentialType:string;credentialReference:string;expiresAt?:string|null|undefined}){
 return withTenantContext(context(p),async c=>{
  const connector=(await c.query(`SELECT pc.id,pc.provider_id FROM provider_connectors pc JOIN providers pr ON pr.id=pc.provider_id WHERE pc.id=$1 AND (pr.scope='PLATFORM' OR pr.tenant_id=$2)`,[connectorId,p.tenantId])).rows[0];if(!connector)throw new Error('CONNECTOR_NOT_VISIBLE');
  const row=(await c.query(`INSERT INTO provider_credentials(tenant_id,provider_id,connector_id,credential_type,credential_reference,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_id,connector_id,credential_type) DO UPDATE SET credential_reference=EXCLUDED.credential_reference,expires_at=EXCLUDED.expires_at,status=CASE WHEN EXCLUDED.expires_at IS NOT NULL AND EXCLUDED.expires_at<=now() THEN 'EXPIRED' ELSE 'ACTIVE' END,updated_at=now() RETURNING id,provider_id,connector_id,credential_type,status,expires_at,rotated_at,created_at,updated_at`,[p.tenantId,connector.provider_id,connectorId,input.credentialType,input.credentialReference,input.expiresAt??null,p.userId])).rows[0];
  await audit(c,p,'credential.metadata.upsert','provider_credential',row?.id,{...row,credentialReference:'[REFERENCE]'});return row;
 });
}

export async function analyticsSummary(p:Principal){
 return withTenantContext(context(p),async c=>(await c.query(`SELECT (SELECT count(*)::int FROM transactions) AS transaction_count,(SELECT COALESCE(jsonb_object_agg(currency,total), '{}'::jsonb) FROM (SELECT currency,sum(total_amount)::text AS total FROM transactions GROUP BY currency) q) AS transaction_value_by_currency,(SELECT count(*)::int FROM transactions WHERE vend_status='FULFILLED') AS fulfilled_count,(SELECT count(*)::int FROM transactions WHERE normalized_status IN ('UNKNOWN','TIMED_OUT')) AS unknown_count,(SELECT count(*)::int FROM refunds WHERE status NOT IN ('COMPLETED','CANCELLED','REJECTED')) AS open_refunds,(SELECT count(*)::int FROM reconciliation_exceptions WHERE status IN ('OPEN','INVESTIGATING')) AS reconciliation_open,(SELECT count(*)::int FROM support_cases WHERE status NOT IN ('RESOLVED','CLOSED')) AS support_open,(SELECT count(*)::int FROM alerts WHERE status IN ('OPEN','ACKNOWLEDGED')) AS alerts_open,(SELECT count(*)::int FROM devices WHERE status='OFFLINE') AS offline_devices`)).rows[0]);
}
