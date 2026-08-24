import Link from "next/link";
import { apiGet, BackOfficeApiError } from "../lib/api";
import { money } from "../lib/format";
import type { OperationsQueues, OperatorContext, TransactionSummary } from "../lib/types";
import { StatusPill } from "../components/status-pill";

export default async function CommandCentrePage() {
  let queues: OperationsQueues | null = null;
  let transactions: TransactionSummary[] = [];
  let error: string | null = null;
  let operator: OperatorContext | null = null;

  try {
    operator = await apiGet<OperatorContext>("/api/v1/auth/context");
    const canRecovery = operator.isPlatformAdmin || operator.permissions.includes("recovery.read");
    const canTransactions = operator.isPlatformAdmin || operator.permissions.includes("transaction.read");
    const [queueResult, transactionResult] = await Promise.allSettled([
      canRecovery ? apiGet<OperationsQueues>("/api/v1/operations/queues") : Promise.resolve(null),
      canTransactions ? apiGet<TransactionSummary[]>("/api/v1/transactions?status=UNKNOWN&limit=8") : Promise.resolve([])
    ]);
    if (queueResult.status === "fulfilled") queues = queueResult.value;
    if (transactionResult.status === "fulfilled") transactions = transactionResult.value;
    const failures=[queueResult,transactionResult].filter((r):r is PromiseRejectedResult=>r.status==="rejected");
    if(failures.length)error="Some command-centre data is temporarily unavailable.";
  } catch (cause) {
    error = cause instanceof BackOfficeApiError
      ? `${cause.code ?? "API_ERROR"}: ${cause.message}`
      : "Back-office API is unavailable.";
  }

  const canRecovery=Boolean(operator?.isPlatformAdmin||operator?.permissions.includes("recovery.read"));
  const canTransactions=Boolean(operator?.isPlatformAdmin||operator?.permissions.includes("transaction.read"));
  const cards = [
    ["Unknown transactions", Number(queues?.unknown_transactions ?? 0).toLocaleString("en-UG"), money(String(queues?.unknown_value ?? "0"))],
    ["Refund required", Number(queues?.refund_required ?? 0).toLocaleString("en-UG"), money(String(queues?.refund_required_value ?? "0"))],
    ["Reconciliation open", Number(queues?.reconciliation_open ?? 0).toLocaleString("en-UG"), "Exceptions awaiting resolution"],
    ["Support open", Number(queues?.support_open ?? 0).toLocaleString("en-UG"), `${Number(queues?.provider_outages ?? 0)} provider outages`]
  ] as const;

  return (
    <>
      <header className="page-head">
        <div>
          <span className="eyebrow">Command Centre</span>
          <h1>Operational exceptions first</h1>
          <p>Cross-provider financial and fulfilment exposure requiring operator attention.</p>
        </div>
        {canTransactions?<Link className="button" href="/transactions">Open transactions</Link>:null}
      </header>

      {error ? <div className="alert">{error}</div> : null}

      {canRecovery?<section className="grid kpi-grid" aria-label="Operational queue summary">
        {cards.map(([label, value, sub]) => (
          <article className="card kpi" key={label}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
            <div className="sub">{sub}</div>
          </article>
        ))}
      </section>:<div className="card"><p>Operational recovery counters are hidden for this role. Authorized transaction data remains available below.</p></div>}

      {canTransactions?<section>
        <div className="section-title">
          <h2>Unknown vending outcomes</h2>
          <Link className="link" href="/transactions?status=UNKNOWN">View all</Link>
        </div>
        <div className="table-wrap">
          {transactions.length === 0 ? (
            <div className="empty">No unknown transactions are currently visible.</div>
          ) : (
            <table>
              <thead><tr><th>Reference</th><th>Merchant</th><th>Provider</th><th>Amount</th><th>Vend</th><th>Hold</th></tr></thead>
              <tbody>
                {transactions.map((item) => (
                  <tr key={item.id}>
                    <td><Link className="link" href={`/transactions/${item.id}`}>{item.reference}</Link></td>
                    <td>{item.merchantName ?? "—"}</td>
                    <td>{item.providerName ?? "—"}</td>
                    <td>{money(item.totalAmount, item.currency)}</td>
                    <td><StatusPill value={item.vendStatus} /></td>
                    <td>{item.financialHoldReason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>:null}
    </>
  );
}
