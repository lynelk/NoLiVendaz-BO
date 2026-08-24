# NOLI Vendaz Back Office Application Completion

## Completion statement

The repository contains the complete production-baseline application for NOLI Vendaz Back Office: a federated multi-provider vending operations and orchestration control plane with operator UI, API, provider adapters, routing, transaction control, financial governance, recovery, support, reconciliation, analytics, administration, observability and deployment/DR tooling.

This document distinguishes application completion from environment activation. Source code can be complete while production still requires real infrastructure, credentials and provider certification.

## Implemented scope

### Control plane
- Tenant-aware IAM/RBAC and immutable audit.
- Provider, connector and capability registries.
- Services/products, merchant/site mappings and routing.
- Canonical transaction lifecycle with separate payment, vending, refund and settlement state.
- NOLI Native, CPay/ChargeNow and configurable generic HTTP provider adapters.
- Signed/replay-protected webhook ingestion and canonical event normalization.

### Reliability and financial control
- Correlation IDs and idempotency.
- Durable vend/refund dispatch leases.
- No blind retry after an ambiguous paid vend.
- Query-only UNKNOWN/TIMED_OUT recovery.
- Refund maker/checker and cumulative-refund protection.
- Provider settlement synchronization and deterministic reference-based matching.
- Reconciliation exception detection and automatic closure when exposure clears.
- Unified support cases and automatic escalation.

### Provider operations
- Controlled DRAFT -> DEVELOPMENT -> SANDBOX -> CERTIFIED lifecycle.
- Connector state controls and capability configuration.
- Health monitoring, outage recovery probes and certification runs.
- Certification snapshot protection and maker/checker approval.
- Production activation remains an explicit controlled deployment/governance action.

### Operator console
- Command Centre.
- Transactions and Transaction 360.
- Providers and Provider Operations.
- Merchants & Sites.
- Services & Products.
- Routing.
- Devices.
- Payments & Settlements.
- Reconciliation.
- Support.
- Integration Health.
- Alerts & Incidents.
- Analytics & Reports.
- Administration.

### Authentication and administration
- OIDC Authorization Code + PKCE.
- HttpOnly internal API session cookie.
- Database-authoritative tenant and RBAC authorization.
- Initial administrator bootstrap command.
- User provisioning/status management, role creation and role assignment.

### Production operations
- API health/readiness and metrics.
- Dedicated recovery and operations workers.
- Critical alert persistence and optional webhook delivery.
- Security headers and framework security gate.
- Dependency audit and CodeQL workflows.
- Independent web/API/recovery/operations container targets.
- PostgreSQL logical backup, checksum upload and restore smoke-test tooling.

## Acceptance invariants

The application must continue to satisfy these invariants:

1. Payment success never implies vending success.
2. An ambiguous post-payment provider result is queried/reconciled before any repeat fulfilment.
3. A dispatched transaction does not automatically fail over to another provider.
4. Refund requests are idempotent and maker/checker approval is enforced.
5. Recovery queries existing financial/provider state and does not resubmit money movement.
6. Settlement matching requires explicit provider references and never guesses from amount/time proximity.
7. Provider-specific logic stays behind adapters.
8. Tenant-owned data is protected by application authorization and PostgreSQL RLS.
9. Raw secrets are not persisted in normal business tables or committed to source.
10. Privileged financial/configuration changes leave audit evidence.

## Environment activation checklist

Before production launch:

- Provision PostgreSQL and private backup/object storage.
- Apply all migrations and seeds.
- Run the initial administrator bootstrap, then remove bootstrap variables.
- Configure an approved OIDC provider and verify login/logout/session expiry.
- Store `JWT_SECRET`, `AUTH_EXCHANGE_SECRET`, provider credentials and webhook secrets in the hosting secret store.
- Configure real NOLI Native and CPay/ChargeNow endpoint/field mappings.
- Run provider sandbox certification and obtain required maker/checker approvals.
- Verify webhook signatures, replay protection and delayed callback handling.
- Verify UNKNOWN transaction recovery does not re-vend.
- Exercise refund approval and recovery with provider sandbox data.
- Synchronize and reconcile provider settlements.
- Verify alert routing, readiness and metrics collection.
- Run a backup and restore smoke test.
- Run repository CI, security CI and the framework security gate.
- Apply the announced Next.js August 26, 2026 security release before deploying on or after that date.

## Known configuration dependencies

The repository does not contain real provider credentials, production OIDC credentials, production database URLs, private backup keys or fabricated provider endpoint paths. NOLI Native and CPay/ChargeNow production mappings must be configured from the deployed provider contracts.

These are deliberate configuration dependencies, not missing application modules.

## Definition of complete

For repository purposes, application completion means all intended operational modules and safety boundaries are implemented and the codebase is ready to be configured, certified and deployed. Production go-live remains contingent on the environment activation checklist above and successful deployment verification.
