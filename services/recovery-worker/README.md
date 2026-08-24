# Recovery Worker

`@nolivendaz/recovery-worker` performs safe, recurring recovery of ambiguous vending and refund states.

## Safety model

The worker never initiates a new vend and never submits a new refund.

For vending uncertainty it calls only the original provider transaction query using the frozen provider, connector and provider transaction reference.

For refund uncertainty it calls only the configured refund-status endpoint using the existing provider refund reference.

If a stable provider reference is unavailable, or repeated safe queries fail to resolve the outcome, the worker opens a deduplicated support case instead of guessing.

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

The interval is clamped to a minimum of 60 seconds. Batch size is clamped to 1..200 per tenant per cycle.

## Concurrency

Recovery claims use PostgreSQL row locking with `SKIP LOCKED` and a 90-second lease. Multiple worker instances can therefore share a queue without intentionally processing the same record concurrently.

A crashed worker does not permanently own work. Once a lease expires, another cycle may safely query the same provider reference.

## Escalation

Automated support cases are created for:

- unknown/timed-out transactions with no provider transaction reference after the escalation window;
- unknown/timed-out transactions that remain unresolved after repeated recovery attempts;
- pending/unknown refunds with no provider refund reference after the escalation window;
- refunds that remain unresolved after repeated safe status queries.

`source_key` deduplication prevents repeated recovery cycles from creating duplicate cases for the same unresolved record.

## Deployment

Run the worker as a separate long-running process from the back-office API. Do not run the recurring loop inside every web/API process.

Use the same database and secret-reference configuration as the API, with network access only to provider endpoints required for status queries. Production should use a process supervisor or platform service restart policy and centralized logs/metrics.
