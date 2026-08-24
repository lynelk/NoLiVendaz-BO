import Link from "next/link";
import { apiGet, BackOfficeApiError } from "../../lib/api.js";
import { dateTime, money } from "../../lib/format.js";
import type { TransactionSummary } from "../../lib/types.js";
import { StatusPill } from "../../components/status-pill.js";

const filters = ["ALL","UNKNOWN","REFUND_PENDING","FULFILLED","SETTLED","FAILED"] as const;

export default async function TransactionsPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const query = await searchParams;
  const selected = query.status?.toUpperCase() ?? "ALL";
  let rows: TransactionSummary[] = [];
  let error: string | null = null;
  try {
    const status = selected === "ALL" ? "" : `&status=${encodeURIComponent(selected)}`;
    rows = await apiGet<TransactionSummary[]>(`/api/v1/transactions?limit=200${status}`);
  } catch (cause) {
    error = cause instanceof BackOfficeApiError ? cause.message : "Transaction data is unavailable.";
  }

  return (
    <>
      <header className="page-head">
        <div><span className="eyebrow">Transactions</span><h1>Unified transaction ledger</h1><p>Payment, vending, refund and settlement states across all connected providers.</p></div>
      </header>
      {error ? <div className="alert">{error}</div> : null}
      <div className="chips" style={{marginBottom:16}}>
        {filters.map((filter) => <Link key={filter} className="chip" href={filter === "ALL" ? "/transactions" : `/transactions?status=${filter}`}>{filter.replaceAll("_"," ")}</Link>)}
      </div>
      <div className="table-wrap">
        {rows.length === 0 ? <div className="empty">No transactions match this view.</div> : (
          <table>
            <thead><tr><th>Reference</th><th>Created</th><th>Merchant</th><th>Provider</th><th>Amount</th><th>Payment</th><th>Vend</th><th>Refund</th><th>Settlement</th></tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.id}>
                <td><Link className="link" href={`/transactions/${row.id}`}>{row.reference}</Link></td>
                <td>{dateTime(row.createdAt)}</td><td>{row.merchantName ?? "—"}</td><td>{row.providerName ?? "—"}</td>
                <td>{money(row.totalAmount,row.currency)}</td><td><StatusPill value={row.paymentStatus}/></td><td><StatusPill value={row.vendStatus}/></td><td><StatusPill value={row.refundStatus}/></td><td><StatusPill value={row.settlementStatus}/></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
