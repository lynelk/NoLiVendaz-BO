# Phase 4 Recovery, Certification and Support Operations

Phase 4 adds autonomous safe recovery, provider certification gates, unified support cases, deterministic settlement matching, operations queues and configurable third-party HTTP provider onboarding.

## Scope implemented

### Automated recovery

`@nolivendaz/recovery-worker` runs recurring recovery cycles across active tenants.

Transaction recovery:

- claims only `UNKNOWN` or `TIMED_OUT` transactions with an original provider transaction reference;
- uses row locks plus a 90-second recovery lease;
- queries the original frozen provider and connector;
- never calls `initiateVend` during recovery;
- never switches provider after dispatch;
- applies bounded retry backoff;
- records recovery audit entries and transaction events;
- escalates to a support case when a provider reference is unavailable or repeated safe queries cannot resolve the state.

Refund recovery:

- claims only `PENDING` or `UNKNOWN` refunds with a stable provider refund reference;
- requires an operational connector with `refund.status` enabled;
- calls only the configured non-mutating refund-status endpoint;
- never re-submits a refund during recovery;
- recalculates the parent transaction financial state after a terminal refund result;
- escalates cases when a stable provider refund reference is unavailable or recovery repeatedly fails.

The worker interval defaults to five minutes and is never allowed below one minute.

```text
RECOVERY_WORKER_INTERVAL_MS=300000
RECOVERY_WORKER_BATCH_SIZE=25
```

A tenant-scoped manual recovery cycle is also available through:

```text
POST /api/v1/recovery/run
```

### Provider onboarding lifecycle

Provider onboarding is explicit and pre-production only in Phase 4.

```text
DRAFT -> DEVELOPMENT -> SANDBOX -> CERTIFIED
```

`DRAFT -> DEVELOPMENT` and `DEVELOPMENT -> SANDBOX` are controlled through:

```text
POST /api/v1/providers/:providerId/lifecycle/advance
```

Non-production connectors can be activated, disabled or placed into maintenance through:

```text
PATCH /api/v1/connectors/:connectorId/preproduction-state
```

The endpoint rejects `PRODUCTION` connectors. Certification owns promotion from sandbox readiness to `CERTIFIED`. Production activation remains a separate governance step and is intentionally not implemented as an automatic Phase 4 transition.

### Provider certification

Certification is deliberately separate from production activation.

A certification run checks:

1. provider lifecycle eligibility;
2. connector enablement and operational status;
3. HTTPS transport outside development;
4. credential references for authenticated connectors;
5. runtime configuration parsing;
6. declared capabilities;
7. endpoint contracts for declared capabilities;
8. normalization field contracts;
9. webhook secret reference when `webhook.receive` is declared;
10. registered provider adapter availability;
11. a non-mutating provider health check.

Certification must run on a non-production connector. A passing run remains `PASSED` until a different authorized user approves it. Approval uses maker/checker control and moves the provider only to `CERTIFIED`. It does not enable a production connector and does not move the provider to `PRODUCTION`.

```text
POST /api/v1/connectors/:connectorId/certification-runs
GET  /api/v1/connectors/:connectorId/certification-runs
POST /api/v1/certification-runs/:runId/approve
```

### Generic third-party HTTP adapter

`@nolivendaz/adapter-http-generic` is registered for:

- `DIRECT_API`
- `UTILITY`
- `AIRTIME`
- `VENDING_MACHINE`
- `AGGREGATOR`
- `CUSTOM`

NOLI-native and CPay continue using their specialized adapters.

The generic adapter uses connector runtime configuration for endpoints, field mappings, status maps, authentication and webhook verification. This keeps provider-specific details out of core transaction logic.

### Unified support cases

Support cases are tenant-scoped and may link to transactions, providers, connectors, refunds and reconciliation exceptions. Linked resources and assignees are validated inside the tenant boundary before persistence.

```text
POST  /api/v1/transactions/:transactionId/support-cases
GET   /api/v1/support/cases
GET   /api/v1/support/cases/:caseId
PATCH /api/v1/support/cases/:caseId
```

Case status history is stored in `support_case_events`; writes are also recorded in the audit log.

Automated recovery creates deduplicated support cases for unresolved financial uncertainty.

### Settlement matching

Settlement matching is deterministic. Phase 4 does not infer a match from amount, timestamp or similar-looking records.

A provider may return stable transaction references through the configured field:

```text
fields.settlementTransactionReferences
```

The value must be an array. Each reference is matched only when all of these hold:

- tenant matches;
- provider matches;
- provider transaction reference matches exactly;
- currency matches;
- vend is `FULFILLED`;
- settlement is not financially blocked.

Matched records are stored in `settlement_transaction_links`. Common completed settlement statuses (`SETTLED`, `COMPLETED`, `SUCCESS`, `SUCCEEDED`, `PAID`) may advance eligible fulfilled transactions to `SETTLED`.

```text
POST /api/v1/providers/:providerId/settlements/sync
GET  /api/v1/settlements/:settlementId/matches
```

### Operations queues

The Command Centre can consume:

```text
GET /api/v1/operations/queues
```

It returns current counts and financial exposure for unknown transactions and refund-required transactions, plus open reconciliation cases, support cases, provider outages and recent certification failures.

### Transaction 360

Transaction 360 now includes:

- recovery attempts;
- next recovery time;
- recovery lease state;
- latest recovery error;
- support cases;
- settlement links;
- refund recovery state;
- existing route, refund, reconciliation and event history.

## Database migration

Apply migrations in order:

```text
001_phase1_control_plane.sql
002_phase2_provider_runtime.sql
003_phase3_routing_financial_control.sql
004_phase4_recovery_certification_support.sql
```

Migration 004 adds recovery scheduling columns, support tables, certification tables, settlement links, RLS policies, indexes, pre-production lifecycle permissions and the `refund.status` capability.

## Safety invariants

1. Recovery performs queries, never a blind vending retry.
2. Refund recovery performs status queries, never a second refund submission.
3. The original provider and connector remain frozen after dispatch.
4. Work claims use leases and row locking to reduce duplicate concurrent recovery.
5. Missing provider references are escalated rather than guessed.
6. Settlement matching requires stable provider transaction references.
7. Certification never activates production automatically.
8. Certification approval is maker/checker controlled.
9. Support-case linked resources and assignees remain inside the tenant boundary.
10. Pre-production lifecycle endpoints cannot activate production connectors.
11. Provider secrets remain references and are never returned by certification results.

## Phase 5 candidate scope

The next phase should focus on operator UI delivery and production operations: Command Centre exception screens, Provider Operations/certification screens, Transaction 360 actions, support workspace, observability dashboards, deployment manifests, production secret-manager integration, backup/DR verification, alert routing and end-to-end sandbox certification against configured NOLI Native and CPay endpoints.
