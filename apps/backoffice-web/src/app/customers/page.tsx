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
    phone:rows.filter(row=>row.protected_service_access==="PHONE_REQUIRED").length,
    identity:rows.filter(row=>row.protected_service_access==="IDENTITY_REQUIRED").length,
    review:rows.filter(row=>row.identity_status==="REVIEW_REQUIRED").length
  };

  return <>
    <header className="page-head"><div><span className="eyebrow">Customer assurance</span><h1>Customers & Identity</h1><p>Phone and identity verification state synchronized from NOLI/CPay. Operators see masked identity evidence and service readiness; local format validation never substitutes for authoritative verification.</p></div></header>
    {error?<div className="alert">{error}</div>:null}
    <section className="grid kpi-grid">
      <article className="card kpi"><div className="label">Service ready</div><div className="value">{counts.ready}</div><div className="sub">Phone + identity verified</div></article>
      <article className="card kpi"><div className="label">Phone required</div><div className="value">{counts.phone}</div><div className="sub">Protected service blocked</div></article>
      <article className="card kpi"><div className="label">Identity required</div><div className="value">{counts.identity}</div><div className="sub">Verification incomplete</div></article>
      <article className="card kpi"><div className="label">Review required</div><div className="value">{counts.review}</div><div className="sub">Operator attention queue</div></article>
    </section>
    <div className="chips" style={{marginBottom:16}}>
      <Link className="chip" href="/customers">All</Link>
      <Link className="chip" href="/customers?access=READY">Ready</Link>
      <Link className="chip" href="/customers?access=PHONE_REQUIRED">Phone required</Link>
      <Link className="chip" href="/customers?access=IDENTITY_REQUIRED">Identity required</Link>
      <Link className="chip" href="/customers?identity=VERIFICATION_PENDING">Verification pending</Link>
      <Link className="chip" href="/customers?identity=VERIFICATION_FAILED">Verification failed</Link>
      <Link className="chip" href="/customers?identity=REVIEW_REQUIRED">Review required</Link>
    </div>
    <div className="table-wrap">
      {filtered.length===0?<div className="empty">No customers match this verification queue.</div>:
      <table><thead><tr><th>Customer</th><th>Phone</th><th>Identification</th><th>Verification</th><th>Service access</th><th>Provider</th><th>Last sync</th></tr></thead>
      <tbody>{filtered.map(row=><tr key={row.id}>
        <td><Link className="link" href={`/customers/${row.id}`}>{row.display_name||row.external_reference}</Link><br/><span>{row.external_reference}</span></td>
        <td>{maskPhone(row.phone)}<br/><StatusPill value={row.phone_verified_at?"VERIFIED":"PHONE_REQUIRED"}/></td>
        <td>{row.identity_type||"—"}{row.identity_country?` · ${row.identity_country}`:""}<br/><span>{row.identity_number_mask||"—"}</span></td>
        <td><StatusPill value={row.identity_status}/></td>
        <td><StatusPill value={row.protected_service_access}/></td>
        <td>{row.identity_provider||row.identity_source||"—"}</td>
        <td>{dateTime(row.identity_last_synced_at||row.updated_at)}</td>
      </tr>)}</tbody></table>}
    </div>
  </>;
}
