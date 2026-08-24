import { notFound } from "next/navigation";
import { apiGet, BackOfficeApiError } from "../../../lib/api.js";
import { dateTime } from "../../../lib/format.js";
import type { ProviderOperations } from "../../../lib/types.js";
import { StatusPill } from "../../../components/status-pill.js";

export default async function ProviderOperationsPage({
  params
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  let data: ProviderOperations;
  try { data = await apiGet<ProviderOperations>(`/api/v1/providers/${providerId}/connectors`); }
  catch (error) {
    if (error instanceof BackOfficeApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <>
      <header className="page-head"><div><span className="eyebrow">Provider Operations</span><h1>{data.provider.name}</h1><p>Connector environment, capability, health and certification evidence.</p></div><StatusPill value={data.provider.status}/></header>
      <section className="grid kpi-grid">
        <article className="card kpi"><div className="label">Connectors</div><div className="value">{data.connectors.length}</div><div className="sub">All environments</div></article>
        <article className="card kpi"><div className="label">Operational</div><div className="value">{data.connectors.filter((c) => c.enabled && ["ACTIVE","DEGRADED"].includes(c.status)).length}</div><div className="sub">Enabled connectors</div></article>
        <article className="card kpi"><div className="label">Healthy</div><div className="value">{data.connectors.filter((c) => c.healthStatus === "HEALTHY").length}</div><div className="sub">Latest health state</div></article>
        <article className="card kpi"><div className="label">Certified</div><div className="value">{data.connectors.filter((c) => c.certificationStatus === "CERTIFIED").length}</div><div className="sub">Latest certification run</div></article>
      </section>
      <div className="table-wrap">
        <table><thead><tr><th>Connector</th><th>Environment</th><th>Status</th><th>Health</th><th>Certification</th><th>Capabilities</th><th>Last health</th></tr></thead>
          <tbody>{data.connectors.map((connector) => <tr key={connector.id}>
            <td><strong>{connector.name}</strong><br/><span className="eyebrow">{connector.apiVersion ?? "version n/a"}</span></td>
            <td>{connector.environment}</td><td><StatusPill value={connector.enabled ? connector.status : "DISABLED"}/></td><td><StatusPill value={connector.healthStatus}/></td><td><StatusPill value={connector.certificationStatus}/></td>
            <td><div className="chips">{connector.capabilities.length ? connector.capabilities.map((cap) => <span className="chip" key={cap}>{cap}</span>) : <span>—</span>}</div></td><td>{dateTime(connector.healthCheckedAt)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>
  );
}
