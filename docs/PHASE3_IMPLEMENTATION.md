# Phase 3 Routing and Financial Control

Phase 3 turns the provider runtime into a controlled execution plane for paid vending transactions and financial recovery.

## Implemented

- Routing-driven vend initiation through `POST /api/v1/vends`.
- Pre-dispatch primary/secondary provider selection using route priority, runtime environment, connector enablement, declared `vend.initiate` capability, provider-product mapping and latest provider health.
- Route decision persistence before any provider call.
- Idempotent transaction creation with `provider_submission_at` recorded before dispatch to prevent concurrent duplicate vending.
- Safe provider failure classification: definitive non-transient 4xx responses become `FAILED`; timeouts, conflicts, throttling, network loss and server failures become `UNKNOWN`.
- No automatic provider switch after dispatch.
- Refund request and maker/checker approval workflow, enforced in application logic and the database.
- Refund idempotency that returns the existing refund without rewinding its state.
- Generic provider refund execution from connector runtime configuration, with required provider refund references.
- Provider settlement synchronization with required field validation and normalized settlement storage.
- Reconciliation exception generation for paid-but-not-fulfilled, long-running refunds and fulfilled-but-not-settled transactions.
- Transaction 360 enrichment with route decisions, refund history and reconciliation exceptions.
- Immutable audit entries for route selection, provider vend results, refund actions, settlement sync and reconciliation runs.
- Tenant RLS and granular permissions for routing, refunds, settlements and reconciliation.

## Safety invariants

1. Provider failover is allowed only before the external vend is dispatched.
2. The chosen provider and connector are persisted before dispatch.
3. Replayed vend idempotency keys return the existing transaction and never call the provider again.
4. Ambiguous provider outcomes become `UNKNOWN`, never a blind retry.
5. Refund requester and approver must be different users.
6. Refunds require a successful payment, must be positive and cannot exceed the transaction total.
7. Replayed refund idempotency keys return the existing refund without changing its current state.
8. Provider operations are restricted to `PROVIDER_RUNTIME_ENV`; production does not silently use sandbox or staging connectors.
9. Refund and settlement actions require their declared connector capabilities.
10. Settlement ingestion rejects missing IDs, currencies, amounts, statuses or invalid periods rather than manufacturing defaults.
11. Provider credentials remain secret references and are not stored in clear text.

## Runtime environment

`PROVIDER_RUNTIME_ENV` must be one of `DEVELOPMENT`, `SANDBOX`, `STAGING` or `PRODUCTION`. It defaults to `PRODUCTION`. Routing considers only connectors in that environment, and refund/settlement operations enforce the same boundary.

## Connector configuration additions

Refunds may define `endpoints.initiateRefund`, `fields.providerRefundId`, `fields.refundStatus` and `refundStatusMap`. The connector must also have `refund.create` enabled.

Settlements may define `endpoints.settlements` with `{from}` and `{to}` placeholders plus fields for settlement array, ID, currency, gross amount, net amount, status, period start and period end. The connector must have `settlement.list` enabled.

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

A vend request entering this API represents a payment already confirmed by the upstream payment source. The control plane records `payment_status=SUCCESS`, selects an eligible route in the configured runtime environment, freezes the provider choice, then dispatches the vend. Payment initiation remains owned by CPay or the applicable payment system rather than being duplicated here.

## Next phase

Phase 4 should add scheduled UNKNOWN/refund-resolution workers, provider certification automation, support-case actions from Transaction 360, richer settlement-to-transaction matching, dashboard exception queues and third-party adapter onboarding/certification tooling.
