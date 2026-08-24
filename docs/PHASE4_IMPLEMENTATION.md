# Phase 4 Recovery, Certification and Support Operations

Phase 4 adds autonomous safe recovery, provider certification gates, unified support cases, deterministic settlement matching, operations queues and configurable third-party HTTP provider onboarding.

## Scope implemented

### Automated recovery

`@nolivendaz/recovery-worker` runs recurring recovery cycles across active tenants.

Transaction recovery:

- begins with `UNKNOWN` or `TIMED_OUT` transactions that have an original provider transaction reference;
- continues polling provider-returned nonterminal states such as `SUBMITTED` and `ACCEPTED` until terminal;
- uses claim-one/process-one `FOR UPDATE SKIP LOCKED` work claiming;
- assigns a unique recovery lease token to every claim;
- sizes leases above the connector timeout and guards every completion/failure write with the same token;
- queries the original frozen provider and connector;
- never calls `initiateVend` during recovery;
- never switches provider after dispatch;
- applies bounded retry backoff;
- records recovery audit entries and transaction events;
- escalates to a support case when a provider reference is unavailable, the connector is not safely queryable or repeated safe queries do not resolve the state.

Refund recovery:

- claims only `PENDING` or `UNKNOWN` refunds with a stable provider refund reference;
- requires an operational connector with `refund.status` enabled;
- calls only the configured non-mutating refund-status endpoint;
- never re-submits a refund during recovery;
- treats transport/configuration failures as ambiguous rather than as proof of refund failure;
- rejects provider responses that return a different refund reference;
- recalculates the parent transaction financial state after a terminal provider result;
- escalates cases when a stable provider refund reference is unavailable or recovery repeatedly fails.

The worker interval defaults to five minutes and is never allowed below one minute. Malformed or non-finite interval values fall back safely instead of creating a tight loop.

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

The endpoint rejects `PRODUCTION` connectors. Certification approval requires the provider to be in `SANDBOX` (or already `CERTIFIED` for recertification). Production activation remains a separate governance step.

### Capability-neutral connector runtime

Connector runtime parsing no longer assumes that every connector is a vending connector.

The shared parser validates the runtime structure only. Individual operations require only the endpoint they actually execute. This allows separate connectors such as:

- vending-only;
- settlement-only;
- refund-only;
- webhook-only;
- mixed-capability connectors.

Vending operations explicitly require `initiateVend` / `getVendStatus`; settlement synchronization requires only `settlements`; refund creation/status require only their respective endpoints. The generic HTTP adapter advertises only capabilities backed by configured endpoints.

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
11. executable capability contracts;
12. a non-mutating provider health check only after transport/credential/runtime preflight succeeds.

Certification records a deterministic hash of the connector configuration and enabled capabilities. Approval recomputes the hash and rejects stale results when connector URL, credentials references, runtime mappings, status, enablement or capabilities changed after the run.

A passing run remains `PASSED` until a different authorized user approves it. Approval uses maker/checker control and moves the provider only to `CERTIFIED`. It does not enable a production connector and does not move the provider to `PRODUCTION`.

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

The generic adapter uses connector runtime configuration for endpoints, field mappings, status maps, authentication and webhook verification. Provider transaction references may be strings or finite numbers and are normalized to canonical strings.

### Unified support cases

Support cases are tenant-scoped and may link to transactions, providers, connectors, refunds and reconciliation exceptions. Linked resources and assignees are validated inside the tenant boundary before persistence.

```text
POST  /api/v1/transactions/:transactionId/support-cases
GET   /api/v1/support/cases
GET   /api/v1/support/cases/:caseId
PATCH /api/v1/support/cases/:caseId
```

Malformed support filters return validation errors rather than server errors. Case status history is stored in `support_case_events`; writes are also recorded in the audit log.

Automated recovery creates deduplicated support cases for unresolved financial uncertainty.

### Settlement matching

Settlement matching is deterministic. Phase 4 does not infer a match from amount, timestamp or similar-looking records.

A provider may return stable transaction references through:

```text
fields.settlementTransactionReferences
```

The value must be an array. Each reference is matched only when all of these hold:

- tenant matches;
- provider matches;
- connector matches the connector that supplied the settlement;
- provider transaction reference matches exactly;
- currency matches;
- vend is `FULFILLED`;
- settlement is not financially blocked.

If the same provider reference is ambiguous even within that connector, it is not auto-matched. Matched records are stored in `settlement_transaction_links`. Common completed settlement statuses (`SETTLED`, `COMPLETED`, `SUCCESS`, `SUCCEEDED`, `PAID`) may advance eligible fulfilled transactions to `SETTLED`.

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

Transaction 360 includes recovery attempts, next recovery time, recovery lease state, latest recovery error, support cases, settlement links, refund recovery state, route decisions, refunds, reconciliation and event history. Recovery lease tokens are internal concurrency controls and are never surfaced as operator credentials or action inputs.

## Database migrations

Apply migrations in order:

```text
001_phase1_control_plane.sql
002_phase2_provider_runtime.sql
003_phase3_routing_financial_control.sql
004_phase4_recovery_certification_support.sql
005_phase4_certification_snapshot_guard.sql
```

Migration 004 adds recovery scheduling/token columns, support tables, certification tables, settlement links, certification hashing, RLS policies, indexes, pre-production lifecycle permissions and the `refund.status` capability.

Migration 005 preserves the certification configuration hash across run updates so maker/checker approval can reject stale certification results.

## Safety invariants

1. Recovery performs queries, never a blind vending retry.
2. Refund recovery performs status queries, never a second refund submission.
3. The original provider and connector remain frozen after dispatch.
4. Recovery completion/failure requires ownership of the current lease token.
5. Missing provider references are escalated rather than guessed.
6. Nonterminal provider results remain scheduled for polling.
7. Settlement matching requires tenant, provider, connector, currency and stable provider transaction reference alignment.
8. Certification never activates production automatically.
9. Certification approval is maker/checker controlled and rejects changed connector configuration.
10. Failed HTTPS preflight prevents provider network probes and therefore prevents accidental credential transmission over rejected plaintext transport.
11. Support-case linked resources and assignees remain inside the tenant boundary.
12. Pre-production lifecycle endpoints cannot activate production connectors.
13. Provider secrets remain references and are never returned by certification results.
14. Capability-neutral runtime parsing allows dedicated settlement/refund connectors without fake vending requirements.

## Phase 5 candidate scope

Phase 5 focuses on operator UI delivery and production operations: Command Centre exception screens, Provider Operations/certification screens, Transaction 360 actions, support workspace, observability dashboards, deployment manifests, production secret-manager integration, backup/DR verification, alert routing and end-to-end sandbox certification against configured NOLI Native and CPay endpoints.
