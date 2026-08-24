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

The operational architecture is governed by the integrated management system under `docs/compliance/`, covering quality, information security, service management, continuity, audit/evidence and applicable financial-message standards.

## Systems of record

The Back Office owns provider configuration, mappings, routing rules, canonical transaction references, normalized events, support cases, exceptions, approvals, cross-provider analytics, and audit.

Providers remain authoritative for provider-native execution data. CPay remains authoritative for CPay-native payment, settlement, billing, and ChargeNow records where used.

PostgreSQL is the NOLI authoritative operational/financial control-plane store. Redis is supporting infrastructure and is never treated as an independent financial source of truth.

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

Service availability never overrides financial integrity. If authoritative financial state cannot be established, unsafe write/routing capabilities are restricted until reconciliation restores confidence.

## Event processing

Provider callbacks enter through the webhook gateway. The gateway verifies authenticity, validates freshness, blocks replay, stores the raw event securely where justified, deduplicates, normalizes, and publishes internal events. Provider callbacks never directly mutate core business tables.

## Correlation and idempotency

Every externally visible transaction uses:

- internal transaction ID;
- human-readable reference;
- correlation ID;
- idempotency key;
- provider transaction ID when available;
- CPay transaction ID when applicable;
- payment reference when applicable.

## Financial-message standards boundary

ISO 20022 and ISO 8583 syntax/profile logic belongs at integration boundaries, not in shared transaction-domain code.

```text
External financial message
      |
Approved profile/version
      |
Schema/field + semantic validation
      |
Provider/payment adapter
      |
Canonical NOLI transaction/payment/event
      |
Message evidence digest + reconciliation references
```

`packages/financial-messaging` provides shared profile/evidence metadata and BIC syntax checks. `financial_message_profiles` records approved standard/network/message versions and mapping versions. `financial_message_events` records traceability metadata/digests without making ordinary tables a dumping ground for sensitive raw payment messages.

A syntactically valid BIC is not proof of assignment or active status. Production BIC routing must additionally validate against an approved authoritative directory/counterparty source and retain that evidence.

If CPay or another provider owns the ISO 20022/8583 boundary, NOLI's responsibility is canonical interface validation, provider certification, supplier assurance, evidence and reconciliation rather than duplicating the upstream network protocol in core services.

## Management-system architecture

The application and operating organization use a single control cycle:

`CONTEXT -> RISK/OBJECTIVES -> CONTROLLED OPERATION -> MEASURE/AUDIT -> CAPA/IMPROVEMENT`

Machine-readable control ownership/evidence requirements live in `docs/compliance/CONTROL_REGISTER.json` and are validated by CI. The management system does not turn runtime health into a claim of certification; objective operating evidence and independent assessment remain required.

## Initial adapters

### Native Vending
Wrap the existing NOLI vending platform. Map native service/product/device identifiers, statuses, errors, transactions, and callbacks into canonical models.

### CPay
Use CPay for the capabilities it actually exposes, including payment, ChargeNow/vending, merchant services, billing, settlement, reconciliation, and webhooks. CPay is an important integration spine, but direct third-party adapters remain permitted.
