import { createHash,timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "@nolivendaz/database";
import { config } from "../config.js";

const schema=z.object({
  tenantCode:z.string().min(2).max(64),
  externalSubject:z.string().min(1).max(300),
  email:z.email().optional(),
  emailVerified:z.boolean().default(false),
  displayName:z.string().max(200).optional()
});
function equalSecret(a:string|undefined,b:string){if(!a)return false;const aa=createHash('sha256').update(a).digest();const bb=createHash('sha256').update(b).digest();return timingSafeEqual(aa,bb);}

export async function registerAuthExchangeRoute(app:FastifyInstance):Promise<void>{
  app.post('/api/v1/auth/exchange',async(request,reply)=>{
    if(!equalSecret(request.headers['x-auth-exchange-secret'] as string|undefined,config.AUTH_EXCHANGE_SECRET))return reply.code(401).send({error:'AUTH_EXCHANGE_UNAUTHORIZED'});
    const parsed=schema.safeParse(request.body);
    if(!parsed.success)return reply.code(400).send({error:'VALIDATION_ERROR',issues:parsed.error.issues});

    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const tenant=(await client.query(`SELECT id FROM tenants WHERE upper(code)=upper($1) AND status='ACTIVE'`,[parsed.data.tenantCode])).rows[0];
      if(!tenant){await client.query('ROLLBACK');return reply.code(401).send({error:'TENANT_NOT_ACTIVE'});}
      await client.query(`SELECT set_config('app.tenant_id',$1,true),set_config('app.is_platform_admin','false',true)`,[tenant.id]);

      let user=(await client.query(
        `SELECT * FROM users
          WHERE tenant_id=$1 AND status='ACTIVE'
            AND (
              external_subject=$2
              OR (
                external_subject IS NULL
                AND $4::boolean=true
                AND $3::text IS NOT NULL
                AND lower(email)=lower($3)
              )
            )
          ORDER BY CASE WHEN external_subject=$2 THEN 0 ELSE 1 END
          LIMIT 1`,
        [tenant.id,parsed.data.externalSubject,parsed.data.email??null,parsed.data.emailVerified]
      )).rows[0];

      if(!user){await client.query('ROLLBACK');return reply.code(401).send({error:'USER_NOT_PROVISIONED'});}

      if(!user.external_subject){
        user=(await client.query(
          `UPDATE users
              SET external_subject=$2,display_name=COALESCE(display_name,$3),last_login_at=now(),updated_at=now()
            WHERE id=$1 AND external_subject IS NULL
            RETURNING *`,
          [user.id,parsed.data.externalSubject,parsed.data.displayName??null]
        )).rows[0];
        if(!user){await client.query('ROLLBACK');return reply.code(409).send({error:'OIDC_SUBJECT_BIND_CONFLICT'});}
      }else{
        await client.query(`UPDATE users SET last_login_at=now() WHERE id=$1`,[user.id]);
      }

      await client.query(
        `INSERT INTO audit_logs(tenant_id,actor_user_id,action,resource_type,resource_id,after_state)
         VALUES($1,$2,'auth.oidc.login','user',$2,$3::jsonb)`,
        [tenant.id,user.id,JSON.stringify({externalSubject:parsed.data.externalSubject,emailVerified:parsed.data.emailVerified})]
      );
      await client.query('COMMIT');
      const token=app.jwt.sign({sub:user.id,tenant_id:tenant.id,email:user.email??parsed.data.email,name:user.display_name??parsed.data.displayName},{expiresIn:'8h'});
      return{data:{token,expiresInSeconds:28800,user:{id:user.id,email:user.email,displayName:user.display_name},tenantId:tenant.id}};
    }catch(error){
      await client.query('ROLLBACK');
      request.log.error({err:error},'OIDC exchange failed');
      return reply.code(500).send({error:'AUTH_EXCHANGE_FAILED'});
    }finally{client.release();}
  });
}
