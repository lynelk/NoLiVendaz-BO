import { cookies } from "next/headers";
import { NextResponse,type NextRequest } from "next/server";
import { oidcConfig } from "../../../lib/oidc.js";

export async function GET(request:NextRequest){
  const cs=await cookies();
  const fail=(code:string)=>{
    const u=new URL("/login",request.url);
    u.searchParams.set("error",code);
    const r=NextResponse.redirect(u);
    r.cookies.delete("noli_oidc_state");
    r.cookies.delete("noli_oidc_verifier");
    r.cookies.delete("noli_oidc_next");
    return r;
  };
  try{
    const cfg=oidcConfig();
    const code=request.nextUrl.searchParams.get("code");
    const state=request.nextUrl.searchParams.get("state");
    if(!code||!state||state!==cs.get("noli_oidc_state")?.value)return fail("OIDC_STATE_INVALID");
    const verifier=cs.get("noli_oidc_verifier")?.value;
    if(!verifier)return fail("OIDC_PKCE_MISSING");

    const form=new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:cfg.redirectUri,client_id:cfg.clientId,code_verifier:verifier});
    if(cfg.clientSecret)form.set("client_secret",cfg.clientSecret);
    const tokenResponse=await fetch(cfg.tokenUrl,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","accept":"application/json"},body:form.toString(),cache:"no-store"});
    if(!tokenResponse.ok)return fail("OIDC_TOKEN_EXCHANGE_FAILED");
    const tokenPayload=await tokenResponse.json() as {access_token?:string};
    if(!tokenPayload.access_token)return fail("OIDC_ACCESS_TOKEN_MISSING");

    const userResponse=await fetch(cfg.userinfoUrl,{headers:{authorization:`Bearer ${tokenPayload.access_token}`,accept:"application/json"},cache:"no-store"});
    if(!userResponse.ok)return fail("OIDC_USERINFO_FAILED");
    const user=await userResponse.json() as {sub?:string;email?:string;email_verified?:boolean;name?:string};
    if(!user.sub)return fail("OIDC_SUBJECT_MISSING");

    const exchange=await fetch(`${cfg.apiUrl}/api/v1/auth/exchange`,{
      method:"POST",
      headers:{"content-type":"application/json","x-auth-exchange-secret":cfg.exchangeSecret},
      body:JSON.stringify({
        tenantCode:cfg.tenantCode,
        externalSubject:user.sub,
        ...(user.email?{email:user.email,emailVerified:user.email_verified===true}:{}),
        ...(user.name?{displayName:user.name}:{})
      }),
      cache:"no-store"
    });
    if(!exchange.ok)return fail("NOLI_USER_NOT_AUTHORIZED");
    const payload=await exchange.json() as {data?:{token?:string;expiresInSeconds?:number}};
    if(!payload.data?.token)return fail("NOLI_SESSION_TOKEN_MISSING");

    const next=cs.get("noli_oidc_next")?.value??"/";
    const safeNext=next.startsWith("/")&&!next.startsWith("//")?next:"/";
    const r=NextResponse.redirect(new URL(safeNext,request.url));
    r.cookies.set("nolivendaz_access_token",payload.data.token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:payload.data.expiresInSeconds??28800});
    r.cookies.delete("noli_oidc_state");
    r.cookies.delete("noli_oidc_verifier");
    r.cookies.delete("noli_oidc_next");
    return r;
  }catch(error){
    console.error("OIDC callback failed",error);
    return fail("OIDC_CALLBACK_FAILED");
  }
}
