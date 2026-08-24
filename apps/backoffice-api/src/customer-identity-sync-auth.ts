import { timingSafeEqual } from "node:crypto";

export type IdentitySyncAuthResult={configured:boolean;valid:boolean};

export function verifyIdentitySyncSecret(value:unknown,configuredSecret=process.env.NOLI_IDENTITY_SYNC_SECRET):IdentitySyncAuthResult{
  const configured=typeof configuredSecret==="string"&&configuredSecret.length>=32;
  if(!configured)return{configured:false,valid:false};
  const supplied=Array.isArray(value)?value[0]:value;
  if(typeof supplied!=="string")return{configured:true,valid:false};
  const expectedBuffer=Buffer.from(configuredSecret,"utf8");
  const suppliedBuffer=Buffer.from(supplied,"utf8");
  if(expectedBuffer.length!==suppliedBuffer.length)return{configured:true,valid:false};
  return{configured:true,valid:timingSafeEqual(expectedBuffer,suppliedBuffer)};
}
