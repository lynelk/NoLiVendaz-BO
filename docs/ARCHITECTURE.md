# Architecture

## Context

NOLI Vendaz Back Office is a federated vending control plane. It presents one administrative and operational environment while allowing each vending provider to retain its native execution model.

```text
Back Office UI
    |
Back Office API
    |
Provider Orchestrator
    |------------------|------------------|
Native Vending      CPay Adapter      Third-Party Adapters
    |                   |                  |
Existing Platform    CPay/ChargeNow      Provider APIs
    \___________________|__________________/
                        |
                 Normalized Events
                        |
          Reconciliation / Support / BI
```

## Systems of record

The Back Office owns provider configuration, mappings, routing rules, canonical transaction references, normalized events, support cases, exceptions, approvals, cross-provider analytics, and audit.

Providers remain authoritative for provider-native execution data. CPay remains authoritative for CPay-native payment, settlement, billing, and ChargeNow records where used.

## Core domain concepts

### Provider
Commercial or service organization that performs or exposes vending.

### Connector
Technical connection to a provider, environment, and API version.

### Capability
An explicit action supported by a connector, for example `vend.initiate`, `vend.status`, `refund.create`, `token.resend`, `device.telemetry`, or `settlement.read`.

### Route
Configuration selecting the provider/connector for a merchant, service, product, country, region, and currency.

### Adapter
Provider-specific implementation of canonical operations.

## Canonical transaction lifecycle

Normal states:

```text
CREATED -> PAYMENT_PENDING -> PAID -> SUBMITTED -> ACCEPTED -> FULFILLED -> SETTLED
```

Exceptional states include:

```text
FAILED
UNKNOWN
TIMED_OUT
CANCELLED
REVERSED
REFUND_PENDING
REFUNDED
DISPUTED
```

Provider-native state must always be retained alongside the normalized state.

## Payment and fulfilment separation

A transaction contains related but independent payment, vend/fulfilment, delivery, refund/reversal, settlement, and reconciliation states.

A paid transaction whose provider response times out is not safe to retry automatically. It must enter `UNKNOWN`, then be queried/reconciled.

## Event processing

Provider callbacks enter through the webhook gateway. The gateway verifies authenticity, validates freshness, blocks replay, stores the raw event securely, deduplicates, normalizes, and publishes internal events. Provider callbacks never directly mutate core business tables.

## Correlation and idempotency

Every externally visible transaction uses:

- internal transaction ID;
- human-readable reference;
- correlation ID;
- idempotency key;
- provider transaction ID when available;
- CPay transaction ID when applicable;
- payment reference when applicable.

## Initial adapters

### Native Vending
Wrap the existing NOLI vending platform. Map native service/product/device identifiers, statuses, errors, transactions, and callbacks into canonical models.

### CPay
Use CPay for the capabilities it actually exposes, including payment, ChargeNow/vending, merchant services, billing, settlement, reconciliation, and webhooks. CPay is an important integration spine, but direct third-party adapters remain permitted.
