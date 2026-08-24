# Phase 3 Routing and Financial Control

Phase 3 turns the provider runtime into a controlled execution plane for paid vending transactions and financial recovery.

## Implemented

- Routing-driven vend initiation through `POST /api/v1/vends`.
- Pre-dispatch primary/secondary provider selection using route priority, connector enablement, declared `vend.initiate` capability and latest provider health.
- Route decision persistence before any provider call.
- Idempotent transaction creation with `provider_submission_at` recorded before dispatch to prevent concurrent duplicate vending.
- Safe provider failure classification: definitive non-transient 4xx responses become `FAILED`; timeouts, conflicts, throttling, network loss and server failures become `UNKNOWN`.
- No automatic provider switch after dispatch.
- Refund request and maker/checker approval workflow.
- Generic provider refund execution from connector runtime configuration.
- Provider settlement synchronization and normalized settlement storage.
- Reconciliation exception generation for paid-but-not-fulfilled and long-running refund cases.
- Tenant RLS and new granular permissions for routing, refunds, settlements and reconciliation.

## Safety invariants

1. Provider failover is allowed only before the external vend is dispatched.
2. The chosen provider and connector are persisted before dispatch.
3. Replayed idempotency keys return the existing transaction and never call the provider again.
4. Ambiguous provider outcomes become `UNKNOWN`, never a blind retry.
5. Refund requester and approver must be different users.
6. Refunds require a successful payment and cannot exceed the transaction total.
7. Provider credentials remain referenced through the secret resolver and are not stored in clear text.

## Connector configuration additions

Refunds may define `endpoints.initiateRefund`, `fields.providerRefundId`, `fields.refundStatus` and `refundStatusMap`.

Settlements may define `endpoints.settlements` with `{from}` and `{to}` placeholders plus fields for settlement array, ID, currency, gross amount, net amount, status, period start and period end.

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

A vend request entering this API represents a payment already confirmed by the upstream payment source. The control plane records `payment_status=SUCCESS`, selects the route, freezes the provider choice, then dispatches the vend. Payment initiation remains owned by CPay or the applicable payment system rather than being duplicated here.

## Next phase

Phase 4 should add scheduled UNKNOWN/refund-resolution workers, provider certification automation, support-case actions from Transaction 360, richer settlement-to-transaction matching, dashboard exception queues and third-party adapter onboarding/certification tooling.
