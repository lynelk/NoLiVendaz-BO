# Phase 5 Implementation

## Objective

Complete the NOLI Vendaz Back Office as an operator-facing, production-oriented application on top of the Phase 1-4 control-plane foundation.

## Implemented operator application

The Next.js web application now covers the full operational navigation: Command Centre, Transactions and Transaction 360, Providers, Merchants & Sites, Services & Products, Routing, Devices, Payments & Settlements, Reconciliation, Support, Integration Health, Alerts & Incidents, Analytics and Administration.

The UI is exception-first. Financial exposure, unresolved vending outcomes, refund requirements, reconciliation exceptions, provider outages and support cases are prioritized above decorative reporting.

## Production authentication

Production operator sign-in uses OIDC Authorization Code + PKCE. The web application completes the identity-provider flow server-side and exchanges the verified identity for a short-lived internal API JWT. The internal token is kept in an HttpOnly cookie and is not exposed to browser JavaScript.

The external identity provider proves identity. NOLI's database remains authoritative for tenant membership, user status, platform-admin status and RBAC permissions.

A controlled `pnpm bootstrap:admin` command creates the first tenant/platform administrator. Subsequent users are provisioned and managed through Administration. OIDC does not automatically create arbitrary application users.

## Management capabilities

Phase 5 adds operational management for users and roles, providers and connectors, connector capabilities, provider lifecycle, provider health and certification, merchants and sites, catalog, routing, alerts and incidents.

Provider connector actions remain capability-aware. Financial and provider actions are still enforced by backend authorization, state machines, idempotency and audit controls.

## Financial operations

The operator console can request and approve/resume refunds under maker/checker controls, synchronize settlements, run reconciliation and open support cases from Transaction 360. Settlement matching remains deterministic and reference-based.

Refund request forms use stable idempotency tokens so browser/form retries do not create duplicate refund intent.

## Observability and automation

The API exposes liveness/readiness and metrics endpoints. A separate operations worker monitors provider health, connector recovery, credential-expiry conditions and critical reconciliation exposure, persisting alerts and optionally delivering critical alerts to a configured webhook destination.

The recovery worker remains separate and query-only for ambiguous vending/refund outcomes. It never re-vends an uncertain paid transaction.

## Persistence expansion

Migration `006` completes the operational schema for customers, devices, payments, provider credential metadata, alerts and incidents. New tenant-owned entities use PostgreSQL row-level security.

The payment workspace also derives transaction-level payment evidence from the canonical transaction model so operators retain visibility while payment-specific adapters populate richer payment records.

## Deployment and disaster recovery

The repository includes independent deployment targets for web, API, recovery worker and operations worker, daily logical-backup tooling, SHA-256 backup checksums, object-storage upload and restore smoke-test scripts.

Security CI includes production dependency auditing and CodeQL. The build runs a framework security gate. Next.js 16.3.0 is deliberately blocked on or after August 26, 2026 until the scheduled security release is applied.

## Completion boundary

The application code is complete as a production baseline. Environment-specific activation still requires real OIDC settings, provider credentials/secret references, deployed NOLI Native and CPay/ChargeNow endpoint mappings, sandbox certification evidence, infrastructure provisioning and successful production deployment checks. These dependencies are intentionally configuration and operations concerns rather than fabricated source defaults.
