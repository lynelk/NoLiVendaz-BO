# Phase 3 Routing and Financial Control

Phase 3 turns the provider runtime into a controlled execution plane for paid vending transactions and financial recovery.

## Implemented

- Routing-driven vend initiation through `POST /api/v1/vends`.
- Pre-dispatch primary/secondary provider selection using route priority, geography, runtime environment, provider lifecycle, connector state, declared `vend.initiate` capability, enabled provider-product mapping and latest provider health.
- Merchant, site, service and product ownership/activation validation before a paid vend can be dispatched.
- Product currency, minimum amount, maximum amount and fixed-price constraints enforced before provider submission.
- Optional provider merchant/site mapping requirements through connector routing configuration.
- Route decision persistence before any provider call.
- Durable vend-dispatch leases and attempt counters so a process interruption after persistence does not permanently strand a transaction. A resumed request uses the same frozen provider, connector and idempotency key.
- Persisted provider routing metadata reused during resumed dispatches.
- Safe provider failure classification: definitive non-transient 4xx responses become `FAILED`; timeouts, conflicts, throttling, network loss and server failures become `UNKNOWN`.
- No automatic provider switch after dispatch.
- Refund request and maker/checker approval workflow, enforced in application logic and the database.
- Cumulative refund reservation prevents aggregate active/completed refunds from exceeding the original transaction value.
- Refund idempotency rejects keys reused against another transaction and returns same-transaction replays without rewinding state.
- Durable refund-dispatch leases make an approved refund resumable after a process interruption while preserving the provider idempotency key.
- Refund dispatch requires an operational connector in the configured runtime environment with `refund.create` enabled.
- Generic provider refund execution from connector runtime configuration, with required provider refund references.
- Provider settlement synchronization selects an operational connector that explicitly declares `settlement.list`.
- Settlement ingestion requires stable provider IDs, valid currency/amount fields and valid periods.
- Settlement uniqueness is tenant-scoped so shared platform connectors can serve multiple tenants safely.
- Reconciliation exception generation for paid-but-not-fulfilled, long-running refunds and fulfilled-but-not-settled transactions.
- Reconciliation runs automatically resolve previously open exceptions when their underlying condition clears.
- Transaction 360 enrichment with route decisions, refund history and reconciliation exceptions.
- Immutable audit entries for route selection, provider vend results, refund actions, settlement sync and reconciliation runs.
- Tenant RLS and granular permissions for routing, refunds, settlements and reconciliation.

## Safety invariants

1. Provider failover is allowed only before the external vend is dispatched.
2. The chosen provider and connector are persisted before dispatch.
3. A vend interrupted before or during provider submission may resume only against the same frozen provider and connector and with the same idempotency key.
4. Replayed vend idempotency keys never create a second logical transaction.
5. Ambiguous provider outcomes become `UNKNOWN`, never a blind cross-provider retry.
6. Refund requester and approver must be different users.
7. Refunds require a successful payment, a terminal known vend outcome and a positive amount within the remaining refundable balance.
8. Replayed refund idempotency keys cannot be used for another transaction or rewind a completed workflow.
9. An approved refund interrupted during dispatch remains resumable under a lease and reuses its provider idempotency key.
10. Provider operations are restricted to `PROVIDER_RUNTIME_ENV`; production does not silently use sandbox or staging connectors.
11. Refund and settlement actions require operational connectors and their declared capabilities.
12. Settlement ingestion rejects missing stable IDs, currencies, amounts, statuses or invalid periods rather than manufacturing defaults.
13. Reconciliation exceptions do not remain open after the underlying exposure has cleared.
14. Provider credentials remain secret references and are not stored in clear text.

## Runtime environment

`PROVIDER_RUNTIME_ENV` must be one of `DEVELOPMENT`, `SANDBOX`, `STAGING` or `PRODUCTION`. It defaults to `PRODUCTION`. Routing considers only connectors in that environment, and refund/settlement operations enforce the same boundary.

## Connector configuration additions

Refunds may define `endpoints.initiateRefund`, `fields.providerRefundId`, `fields.refundStatus` and `refundStatusMap`. The connector must also have `refund.create` enabled.

Settlements may define `endpoints.settlements` with `{from}` and `{to}` placeholders plus fields for settlement array, ID, currency, gross amount, net amount, status, period start and period end. Settlement synchronization deliberately selects a connector with `settlement.list` enabled rather than assuming the vending connector also performs settlement operations.

A connector may also require external provider mappings during route selection:

```json
{
  "routing": {
    "requireMerchantMapping": true,
    "requireSiteMapping": true
  }
}
```

## APIs

```text
POST /api/v1/vends
POST /api/v1/transactions/:transactionId/refunds
POST /api/v1/refunds/:refundId/approve
GET  /api/v1/refunds
POST /api/v1/providers/:providerId/settlements/sync?from=<ISO>&to=<ISO>
GET  /api/v1/settlements
POST /api/v1/reconciliation/run
GET  /api/v1/reconciliation/exceptions
```

## Operational model

A vend request entering this API represents a payment already confirmed by the upstream payment source. The control plane validates merchant/site/catalog constraints, selects an eligible route in the configured runtime environment, persists and freezes that decision, then claims a durable dispatch lease before calling the provider. If the process stops before the provider result is recorded, the lease can expire and the same transaction can resume against the same provider with the same idempotency key. Payment initiation remains owned by CPay or the applicable payment system rather than being duplicated here.

Refund approval follows the same principle: maker/checker approval is persisted first, then provider dispatch is claimed under a lease. A crash does not require a new refund object or a new provider idempotency key.

## Verification note

The repository contains GitHub Actions CI for linting, typechecking, tests and builds. During this Phase 3 review GitHub did not expose a workflow/status result for the latest PR head, and the local execution sandbox could not resolve `github.com`, so no CI success is claimed. Phase 3 was instead reviewed against the concrete automated-review findings and hardened before merge.

## Next phase

Phase 4 should add scheduled UNKNOWN/refund-resolution workers, provider certification automation, support-case actions from Transaction 360, richer settlement-to-transaction matching, dashboard exception queues and third-party adapter onboarding/certification tooling.
