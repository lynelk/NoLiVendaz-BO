# Recovery Worker

`@nolivendaz/recovery-worker` performs safe, recurring recovery of ambiguous vending and refund states.

## Safety model

The worker never initiates a new vend and never submits a new refund.

For vending uncertainty it calls only the original provider transaction query using the frozen provider, connector and provider transaction reference. If a query returns a nonterminal state such as `SUBMITTED` or `ACCEPTED`, the transaction remains scheduled for polling until it reaches a terminal outcome or is escalated.

For refund uncertainty it calls only the configured refund-status endpoint using the existing provider refund reference. Transport/configuration failures remain ambiguous and do not mark a refund failed. A provider response that returns a different refund reference is rejected as ambiguous.

If a stable provider reference is unavailable, a connector cannot safely query the record, or repeated safe queries fail to resolve the outcome, the worker opens a deduplicated support case instead of guessing.

## Runtime

```bash
pnpm --filter @nolivendaz/recovery-worker build
pnpm --filter @nolivendaz/recovery-worker start
```

Configuration:

```text
RECOVERY_WORKER_INTERVAL_MS=300000
RECOVERY_WORKER_BATCH_SIZE=25
DATABASE_URL=postgresql://...
```

The interval is validated and clamped to a minimum of 60 seconds. Malformed/non-finite interval values fall back to five minutes. Batch size is clamped to 1..200 per tenant per cycle.

## Concurrency

Recovery uses a claim-one/process-one model with PostgreSQL `FOR UPDATE SKIP LOCKED`, a per-record lease token and a lease duration sized above the connector timeout.

Every completion/failure write must still own the same lease token. If a lease expires and another worker reclaims the record, a stale worker may finish its provider GET request but cannot overwrite the newer worker's database state.

A crashed worker does not permanently own work. Once the lease expires, another cycle may safely query the same frozen provider reference.

## Escalation

Automated support cases are created for:

- unknown/timed-out transactions with no provider transaction reference after the escalation window;
- transactions whose configured connector cannot be safely queried;
- transactions that remain unresolved after repeated recovery attempts;
- pending/unknown refunds with no provider refund reference after the escalation window;
- refunds without an operational `refund.status` path;
- refunds that remain unresolved after repeated safe status queries.

`source_key` deduplication prevents repeated recovery cycles from creating duplicate cases for the same unresolved record.

## Deployment

Run the worker as a separate long-running process from the back-office API. Do not run the recurring loop inside every web/API process.

Use the same database and secret-reference configuration as the API, with network access only to provider endpoints required for status queries. Production should use a process supervisor or platform service restart policy and centralized logs/metrics.
