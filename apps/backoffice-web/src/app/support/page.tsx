import Link from "next/link";
import { apiGet, BackOfficeApiError } from "../../lib/api";
import { dateTime } from "../../lib/format";
import type { SupportCase } from "../../lib/types";
import { StatusPill } from "../../components/status-pill";

export default async function SupportPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  const query = await searchParams;
  let cases: SupportCase[] = [];
  let error: string | null = null;
  try {
    const params = new URLSearchParams({ limit: "200" });
    if (query.status) params.set("status", query.status);
    if (query.priority) params.set("priority", query.priority);
    cases = await apiGet<SupportCase[]>(`/api/v1/support/cases?${params.toString()}`);
  } catch (cause) { error = cause instanceof BackOfficeApiError ? cause.message : "Support data is unavailable."; }

  return (
    <>
      <header className="page-head"><div><span className="eyebrow">Support</span><h1>Operational case workspace</h1><p>Transaction, refund, settlement and provider cases in one tenant-scoped queue.</p></div></header>
      {error ? <div className="alert">{error}</div> : null}
      <div className="chips" style={{marginBottom:16}}>
        <Link className="chip" href="/support">All</Link><Link className="chip" href="/support?status=OPEN">Open</Link><Link className="chip" href="/support?status=INVESTIGATING">Investigating</Link><Link className="chip" href="/support?priority=CRITICAL">Critical</Link>
      </div>
      <div className="table-wrap">
        {cases.length === 0 ? <div className="empty">No support cases match this queue.</div> : (
          <table><thead><tr><th>Case</th><th>Priority</th><th>Status</th><th>Category</th><th>Transaction</th><th>Provider</th><th>Opened</th></tr></thead>
            <tbody>{cases.map((item) => <tr key={item.id}>
              <td><strong>{item.case_number ?? item.id}</strong><br/><span>{item.title}</span></td><td><StatusPill value={item.priority}/></td><td><StatusPill value={item.status}/></td><td>{item.category}</td>
              <td>{item.transaction_id ? <Link className="link" href={`/transactions/${item.transaction_id}`}>{item.transaction_reference ?? item.transaction_id}</Link> : "—"}</td><td>{item.provider_name ?? "—"}</td><td>{dateTime(item.opened_at)}</td>
            </tr>)}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
