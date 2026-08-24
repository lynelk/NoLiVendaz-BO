import Link from "next/link";
import { notFound } from "next/navigation";
import { apiGet, BackOfficeApiError } from "../../../lib/api";
import { dateTime } from "../../../lib/format";
import type { CustomerIdentityRecord } from "../../../lib/types";
import { StatusPill } from "../../../components/status-pill";

function maskPhone(value?:string|null){
  if(!value)return "—";
  const digits=value.replace(/\D/g,"");
  if(digits.length<6)return "***";
  return `+${digits.slice(0,3)} ${"*".repeat(Math.max(3,digits.length-7))} ${digits.slice(-4)}`;
}
function maskEmail(value?:string|null){
  if(!value)return "—";
  const [local,domain]=value.split("@");
  if(!domain)return "***";
  return `${local?.slice(0,1)||"*"}${"*".repeat(Math.max(3,(local?.length||1)-1))}@${domain}`;
}
const shown=(value?:string|null)=>value?.trim()||"—";

export default async function Page({params}:{params:Promise<{customerId:string}>}){
  const {customerId}=await params;
  let customer:CustomerIdentityRecord;
  try{customer=await apiGet<CustomerIdentityRecord>(`/api/v1/customers/${encodeURIComponent(customerId)}/identity`);}
  catch(error){if(error instanceof BackOfficeApiError&&error.status===404)notFound();throw error;}

  return <>
    <header className="page-head"><div><span className="eyebrow">Customer assurance</span><h1>{customer.display_name||customer.external_reference}</h1><p>Verification evidence and service-access readiness synchronized from NOLI/CPay. Raw identification numbers are not exposed in this workspace.</p></div><div className="actions"><Link className="button button-secondary" href="/customers">Back to customers</Link></div></header>
    <section className="grid detail-grid">
      <article className="card detail"><span>Phone verification</span><StatusPill value={customer.phone_verified_at?"VERIFIED":"PHONE_REQUIRED"}/></article>
      <article className="card detail"><span>Identity verification</span><StatusPill value={customer.identity_status}/></article>
      <article className="card detail"><span>Protected service access</span><StatusPill value={customer.protected_service_access}/></article>
    </section>
    <section className="grid two-col">
      <div className="stack">
        <article className="card"><div className="section-title"><h2>Customer assurance profile</h2><span className="eyebrow">{shown(customer.identity_source)}</span></div><div className="grid detail-grid">
          <div className="detail"><span>Customer reference</span><strong>{customer.external_reference}</strong></div>
          <div className="detail"><span>Account status</span><StatusPill value={customer.status}/></div>
          <div className="detail"><span>Phone</span><strong>{maskPhone(customer.phone)}</strong></div>
          <div className="detail"><span>Email</span><strong>{maskEmail(customer.email)}</strong></div>
          <div className="detail"><span>Phone verified</span><strong>{dateTime(customer.phone_verified_at)}</strong></div>
          <div className="detail"><span>Identification type</span><strong>{shown(customer.identity_type)}</strong></div>
          <div className="detail"><span>Country</span><strong>{shown(customer.identity_country)}</strong></div>
          <div className="detail"><span>Identification number</span><strong>{shown(customer.identity_number_mask)}</strong></div>
          <div className="detail"><span>Identity status</span><StatusPill value={customer.identity_status}/></div>
        </div></article>
        <article className="card"><h2>Authoritative verification evidence</h2><div className="grid detail-grid">
          <div className="detail"><span>Identity provider</span><strong>{shown(customer.identity_provider)}</strong></div>
          <div className="detail"><span>Provider reference</span><strong>{shown(customer.identity_provider_reference)}</strong></div>
          <div className="detail"><span>Verified at</span><strong>{dateTime(customer.identity_verified_at)}</strong></div>
          <div className="detail"><span>Source</span><strong>{shown(customer.identity_source)}</strong></div>
          <div className="detail"><span>Last synchronized</span><strong>{dateTime(customer.identity_last_synced_at)}</strong></div>
        </div></article>
      </div>
      <div className="stack">
        <article className="card"><h2>Consent evidence</h2><div className="detail"><span>Consent version</span><strong>{shown(customer.consent_version)}</strong><span>Accepted at</span><strong>{dateTime(customer.consent_accepted_at)}</strong></div></article>
        <article className="card"><h2>Operational interpretation</h2><div className="detail"><span>Service access</span><StatusPill value={customer.protected_service_access}/><span>Rule</span><strong>Protected vending requires a verified registered phone and an authoritative VERIFIED identity state.</strong><span>Privacy boundary</span><strong>Use masked identifiers and provider references for investigation. Do not paste raw identification numbers into support or audit notes.</strong></div></article>
        <article className="card"><h2>Record timestamps</h2><div className="detail"><span>Created</span><strong>{dateTime(customer.created_at)}</strong><span>Updated</span><strong>{dateTime(customer.updated_at)}</strong></div></article>
      </div>
    </section>
  </>;
}
