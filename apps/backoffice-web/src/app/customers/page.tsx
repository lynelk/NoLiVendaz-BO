import { apiGet } from "../../lib/api";
import { DataTable } from "../../components/data-table";

export default async function Page(){
  const rows=await apiGet<Array<Record<string,unknown>>>("/api/v1/customers");
  return <>
    <header className="page-head"><div><span className="eyebrow">Customer assurance</span><h1>Customers & Identity</h1><p>Masked phone and identity-verification state synchronized from NOLI/CPay. Format validation is not authoritative verification, and operators cannot see raw identification numbers.</p></div></header>
    <DataTable rows={rows} columns={[
      {key:"external_reference",label:"Customer"},
      {key:"display_name",label:"Name"},
      {key:"phone",label:"Phone"},
      {key:"phone_verified_at",label:"Phone verified"},
      {key:"identity_type",label:"ID type"},
      {key:"identity_country",label:"Country"},
      {key:"identity_number_mask",label:"Masked ID"},
      {key:"identity_status",label:"Verification"},
      {key:"identity_provider",label:"Provider"},
      {key:"protected_service_access",label:"Service access"},
      {key:"identity_last_synced_at",label:"Last sync"}
    ]}/>
  </>;
}
