import type { Principal } from "@nolivendaz/canonical-models";
import { withTenantContext } from "@nolivendaz/database";

const context=(p:Principal)=>({tenantId:p.tenantId,isPlatformAdmin:p.isPlatformAdmin,userId:p.userId});
async function audit(client:any,p:Principal,action:string,type:string,id:string,state:unknown){await client.query(`INSERT INTO audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,after_state) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[p.tenantId,p.userId,action,type,id,JSON.stringify(state??{})]);}

export async function provisionUser(p:Principal,input:{email:string;displayName?:string|undefined;isPlatformAdmin?:boolean|undefined}){
 return withTenantContext(context(p),async client=>{
  if(input.isPlatformAdmin&&!p.isPlatformAdmin)throw new Error("PLATFORM_ADMIN_GRANT_REQUIRES_PLATFORM_ADMIN");
  const email=input.email.trim().toLowerCase();
  const row=(await client.query(`INSERT INTO users(tenant_id,email,display_name,status,is_platform_admin) VALUES($1,$2,$3,'ACTIVE',$4) ON CONFLICT(tenant_id,email) DO UPDATE SET display_name=COALESCE(EXCLUDED.display_name,users.display_name),status='ACTIVE',is_platform_admin=CASE WHEN $5 THEN EXCLUDED.is_platform_admin ELSE users.is_platform_admin END,updated_at=now() RETURNING id,email,display_name,status,is_platform_admin,external_subject,last_login_at,created_at`,[p.tenantId,email,input.displayName??null,input.isPlatformAdmin??false,p.isPlatformAdmin])).rows[0];
  if(!row)throw new Error("USER_PROVISION_FAILED");await audit(client,p,"admin.user.provision","user",String(row.id),row);return row;
 });
}
export async function setUserStatus(p:Principal,userId:string,status:"ACTIVE"|"SUSPENDED"|"DISABLED"){
 return withTenantContext(context(p),async client=>{if(userId===p.userId&&status!=="ACTIVE")throw new Error("CANNOT_DISABLE_CURRENT_USER");const row=(await client.query(`UPDATE users SET status=$3,updated_at=now() WHERE id=$1 AND tenant_id=$2 RETURNING id,email,display_name,status,is_platform_admin,last_login_at`,[userId,p.tenantId,status])).rows[0];if(!row)throw new Error("USER_NOT_FOUND");await audit(client,p,"admin.user.status","user",userId,row);return row;});
}
export async function assignRole(p:Principal,userId:string,roleId:string){
 return withTenantContext(context(p),async client=>{const user=await client.query(`SELECT 1 FROM users WHERE id=$1 AND tenant_id=$2`,[userId,p.tenantId]);if(user.rowCount!==1)throw new Error("USER_NOT_FOUND");const role=(await client.query(`SELECT id,code,name,tenant_id FROM roles WHERE id=$1 AND (tenant_id IS NULL OR tenant_id=$2)`,[roleId,p.tenantId])).rows[0];if(!role)throw new Error("ROLE_NOT_ACCESSIBLE");await client.query(`INSERT INTO user_roles(user_id,role_id,assigned_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[userId,roleId,p.userId]);await audit(client,p,"admin.user.role.assign","user",userId,{roleId,roleCode:role.code});return{userId,role};});
}
export async function removeRole(p:Principal,userId:string,roleId:string){
 return withTenantContext(context(p),async client=>{if(userId===p.userId){const role=(await client.query(`SELECT code FROM roles WHERE id=$1`,[roleId])).rows[0];if(role?.code==="PLATFORM_SUPER_ADMIN")throw new Error("CANNOT_REMOVE_OWN_SUPER_ADMIN_ROLE");}const result=await client.query(`DELETE FROM user_roles ur USING users u WHERE ur.user_id=u.id AND ur.user_id=$1 AND ur.role_id=$2 AND u.tenant_id=$3`,[userId,roleId,p.tenantId]);await audit(client,p,"admin.user.role.remove","user",userId,{roleId,removed:(result.rowCount??0)>0});return{userId,roleId,removed:(result.rowCount??0)>0};});
}
export async function createTenantRole(p:Principal,input:{code:string;name:string;description?:string|undefined;permissions:string[]}){
 return withTenantContext(context(p),async client=>{const code=input.code.trim().toUpperCase();const role=(await client.query(`INSERT INTO roles(tenant_id,code,name,description,system_defined) VALUES($1,$2,$3,$4,false) ON CONFLICT(tenant_id,code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description RETURNING id,code,name,description,system_defined`,[p.tenantId,code,input.name,input.description??null])).rows[0];if(!role)throw new Error("ROLE_CREATE_FAILED");const permissions=[...new Set(input.permissions)];let resolved:{id:string;code:string}[]=[];if(permissions.length){const result=await client.query<{id:string;code:string}>(`SELECT id,code FROM permissions WHERE code=ANY($1::text[])`,[permissions]);resolved=result.rows;if(resolved.length!==permissions.length)throw new Error("UNKNOWN_PERMISSION_IN_ROLE");}await client.query(`DELETE FROM role_permissions WHERE role_id=$1`,[role.id]);for(const permission of resolved)await client.query(`INSERT INTO role_permissions(role_id,permission_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,[role.id,permission.id]);await audit(client,p,"admin.role.upsert","role",String(role.id),{...role,permissions});return{...role,permissions};});
}
