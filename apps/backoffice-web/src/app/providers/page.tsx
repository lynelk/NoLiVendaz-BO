import Link from "next/link";
import { apiGet, BackOfficeApiError } from "../../lib/api.js";
import type { ProviderSummary } from "../../lib/types.js";
import { StatusPill } from "../../components/status-pill.js";

export default async function ProvidersPage() {
  let providers: ProviderSummary[] = [];
  let error: string | null = null;
  try { providers = await apiGet<ProviderSummary[]>("/api/v1/providers"); }
  catch (cause) { error = cause instanceof BackOfficeApiError ? cause.message : "Provider data is unavailable."; }

  return (
    <>
      <header className="page-head"><div><span className="eyebrow">Providers</span><h1>Provider operations</h1><p>Lifecycle, connector health, capabilities and certification across vending integrations.</p></div></header>
      {error ? <div className="alert">{error}</div> : null}
      <div className="table-wrap">
        {providers.length === 0 ? <div className="empty">No providers are visible to this operator.</div> : (
          <table><thead><tr><th>Provider</th><th>Type</th><th>Scope</th><th>Country</th><th>Status</th><th>Currencies</th></tr></thead>
            <tbody>{providers.map((provider) => <tr key={provider.id}>
              <td><Link className="link" href={`/providers/${provider.id}`}>{provider.name}</Link><br/><span className="eyebrow">{provider.code}</span></td>
              <td>{provider.providerType}</td><td>{provider.scope}</td><td>{provider.country ?? "—"}</td><td><StatusPill value={provider.status}/></td><td>{provider.supportedCurrencies?.join(", ") || "—"}</td>
            </tr>)}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
