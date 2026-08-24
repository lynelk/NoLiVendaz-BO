import Link from "next/link";
import { apiGet, BackOfficeApiError } from "../../lib/api";
import { dateTime } from "../../lib/format";
import type { CustomerIdentityRecord } from "../../lib/types";
import { StatusPill } from "../../components/status-pill";

function maskPhone(value?: string | null){
  if(!value)return "—";
  const digits=value.replace(/\D/g,"");
  if(digits.length<6)return "***";
  return `+${digits.slice(0,3)} ${"*".repeat(Math.max(3,digits.length-7))} ${digits.slice(-4)}`;
}

export default async function Page({
  searchParams
}:{
  searchParams:Promise<{access?:string;identity?:string}>
}){
  const query=await searchParams;
  let rows:CustomerIdentityRecord[]=[];
  let error:string|null=null;
  try{rows=await apiGet<CustomerIdentityRecord[]>("/api/v1/customers");}
  catch(cause){error=cause instanceof BackOfficeApiError?cause.message:"Customer identity data is unavailable.";}

  const filtered=rows.filter(row=>(!query.access||row.protected_service_access===query.access)&&(!query.identity||row.identity_status===query.identity));
  const counts={
    ready:rows.filter(row=>row.protected_service_access==="READY").length,
    blocked:rows.filter(row=>!row.protected_service_allowed).length,
    pending:rows.filter(row=>row.identity_status==="VERIFICATION_PENDING").length,
    review:rows.filter(row=>row.identity_status==="REVIEW_REQUIRED"||row.identity_status==="VERIFICATION_FAILED").length
  };

  return <>
    <header className="page-head"><div><span className="eyebrow">Customer assurance</span><h1>Customers & Identity</h1><p>Protected-service readiness synchronized from NOLI and CPay. Operators see policy gates, masked identity evidence and authoritative verification state; local format checks never substitute for provider verification.</p></div><div className="actions"><Link className="button button-secondary" href="/customers/identity-capabilities">Identity policy & provider coverage</Link></div></header>
    {error?<div className="alert">{error}</div>:null}
    <section className="grid kpi-grid">
      <article className="card kpi"><div className="label">Service ready</div><div className="value">{counts.ready}</div><div className="sub">All protected-service gates satisfied</div></article>
      <article className="card kpi"><div className="label">Access blocked</div><div className="value">{counts.blocked}</div><div className="sub">One or more required controls missing</div></article>
      <article className="card kpi"><div className="label">Verification pending</div><div className="value">{counts.pending}</div><div className="sub">Awaiting authoritative identity result</div></article>
      <article className="card kpi"><div className="label">Review queue</div><div className="value">{counts.review}</div><div className="sub">Failed or review-required identity state</div></article>
    </section>
    <div className="chips" style={{marginBottom:16}}>
      <Link className="chip" href="/customers">All</Link>
      <Link className="chip" href="/customers?access=READY">Ready</Link>
      <Link className="chip" href="/customers?access=PROFILE_REQUIRED">Profile required</Link>
      <Link className="chip" href="/customers?access=TERMS_REQUIRED">Terms required</Link>
      <Link className="chip" href="/customers?access=PHONE_REQUIRED">Phone required</Link>
      <Link className="chip" href="/customers?access=IDENTITY_REQUIRED">Identity required</Link>
      <Link className="chip" href="/customers?access=IDENTITY_CONSENT_REQUIRED">Consent required</Link>
      <Link className="chip" href="/customers?access=IDENTITY_VERIFICATION_REQUIRED">Verification required</Link>
      <Link className="chip" href="/customers?identity=REVIEW_REQUIRED">Review required</Link>
    </div>
    <div className="table-wrap">
      {filtered.length===0?<div className="empty">No customers match this assurance queue.</div>:
      <table><thead><tr><th>Customer</th><th>Phone</th><th>Identification</th><th>Verification</th><th>Service access</th><th>Missing gates</th><th>Last source event</th></tr></thead>
      <tbody>{filtered.map(row=><tr key={row.id}>
        <td><Link className="link" href={`/customers/${row.id}`}>{row.display_name||row.external_reference}</Link><br/><span>{row.external_reference}</span></td>
        <td>{maskPhone(row.phone)}<br/><StatusPill value={row.phone_verified_at?"VERIFIED":"PHONE_REQUIRED"}/></td>
        <td>{row.identity_type||"—"}{row.identity_country?` · ${row.identity_country}`:""}<br/><span>{row.identity_number_mask||"—"}</span></td>
        <td><StatusPill value={row.identity_status}/><br/><span>{row.identity_provider||row.identity_source||"—"}</span></td>
        <td><StatusPill value={row.protected_service_access}/></td>
        <td>{row.protected_service_missing.length?row.protected_service_missing.join(", "):"—"}</td>
        <td>{dateTime(row.identity_source_updated_at||row.identity_last_synced_at||row.updated_at)}</td>
      </tr>)}</tbody></table>}
    </div>
  </>;
}
