import Link from "next/link";
import { apiGet, BackOfficeApiError } from "../../../lib/api";
import { dateTime } from "../../../lib/format";
import type { CustomerServiceAccessPolicy, IdentityProviderCapability } from "../../../lib/types";
import { StatusPill } from "../../../components/status-pill";

export default async function Page(){
  let capabilities:IdentityProviderCapability[]=[];
  let policy:CustomerServiceAccessPolicy|null=null;
  let error:string|null=null;
  try{
    [capabilities,policy]=await Promise.all([
      apiGet<IdentityProviderCapability[]>("/api/v1/customer-identity/capabilities"),
      apiGet<CustomerServiceAccessPolicy>("/api/v1/customer-identity/service-access-policy")
    ]);
  }catch(cause){
    error=cause instanceof BackOfficeApiError?cause.message:"Identity policy and provider coverage are unavailable.";
  }

  return <>
    <header className="page-head"><div><span className="eyebrow">Identity operations</span><h1>Identity policy & provider coverage</h1><p>Operational visibility into the protected-service gates used by NOLI and the document/country coverage synchronized from CPay. This page contains capability metadata only, never raw identification numbers.</p></div><div className="actions"><Link className="button button-secondary" href="/customers">Back to customers</Link></div></header>
    {error?<div className="alert">{error}</div>:null}

    <section className="grid two-col">
      <article className="card">
        <div className="section-title"><div><span className="eyebrow">Protected service</span><h2>{policy?.service??"POWER_BANK_RENTAL"}</h2></div><StatusPill value={policy?"ACTIVE":"UNAVAILABLE"}/></div>
        <p>Baseline policy version: <strong>{policy?.baselineVersion??"—"}</strong></p>
        <div className="stack">
          {(policy?.requirements??[]).map(item=><div className="detail" key={item.code}><span>{item.code}</span><strong>{item.label}</strong></div>)}
          {!policy?<div className="empty">Policy metadata is not currently available.</div>:null}
        </div>
      </article>

      <article className="card">
        <div className="section-title"><div><span className="eyebrow">Control boundary</span><h2>Authoritative verification</h2></div></div>
        <div className="detail"><span>Validation</span><strong>Local format/length checks only. Never grants service access.</strong><span>Verification</span><strong>Requires an authoritative provider result synchronized from NOLI/CPay.</strong><span>Operator capability</span><strong>Read and investigate masked state. Human operators cannot promote verification through the sync API.</strong><span>Privacy</span><strong>Use masked identifiers and provider references. Raw identity numbers must never enter Back Office.</strong></div>
      </article>
    </section>

    <section className="card" style={{marginTop:16}}>
      <div className="section-title"><div><span className="eyebrow">CPay capability projection</span><h2>Identity providers</h2></div><span>{capabilities.length} configured</span></div>
      {capabilities.length===0?<div className="empty">No provider capability snapshot has been synchronized yet.</div>:
      <div className="table-wrap"><table><thead><tr><th>Provider</th><th>Status</th><th>Modes</th><th>ID types</th><th>Countries</th><th>Source</th><th>Source event</th></tr></thead><tbody>
        {capabilities.map(item=><tr key={item.id}>
          <td><strong>{item.provider_code}</strong></td>
          <td><StatusPill value={item.enabled?"ACTIVE":"DISABLED"}/></td>
          <td>{[item.supports_sync?"Synchronous":null,item.supports_async?"Asynchronous":null].filter(Boolean).join(" · ")||"None"}</td>
          <td>{item.supported_identity_types.length?item.supported_identity_types.join(", "):"—"}</td>
          <td>{item.supported_countries.length?item.supported_countries.join(", "):"—"}</td>
          <td>{item.source}{item.source_reference?` · ${item.source_reference}`:""}</td>
          <td>{dateTime(item.source_updated_at)}</td>
        </tr>)}
      </tbody></table></div>}
    </section>
  </>;
}
