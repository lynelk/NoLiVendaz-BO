# NOLI Vendaz Back Office

Unified multi-provider vending operations and orchestration control plane for NOLI Vendaz.

> One operational view, many vending engines.

The application provides one secure operational workspace across NOLI Native Vending, CPay/ChargeNow-connected services, and approved direct third-party vending providers. Core services own canonical transactions, routing, financial control, support, reconciliation, analytics, governance and audit. Provider-specific execution stays behind adapters.

## Application status

The repository now contains the complete back-office application baseline: operator web UI, API, provider adapters and orchestrator, webhook processing, automated recovery, operations monitoring, provider certification, financial reconciliation, customer identity assurance, administration, authentication, observability and deployment/DR tooling.

Production readiness still depends on environment-specific configuration: real OIDC credentials, production secret-manager values, deployed NOLI Native and CPay/ChargeNow endpoint mappings, provider sandbox certification, database/object-storage provisioning and successful deployment checks. Those values are intentionally not embedded in source.

See `docs/APPLICATION_COMPLETION.md` for the implemented scope and production gates.

## Runtime services

```text
apps/backoffice-web        Next.js operator console
apps/backoffice-api        Fastify control-plane API
services/recovery-worker   Safe UNKNOWN/refund recovery worker
services/operations-worker Provider health, alert and credential monitoring
```

Supporting packages and services include the provider orchestrator, reconciliation service, webhook gateway, canonical models, database package, provider SDK and financial-message governance utilities. Provider integrations live under `adapters/`.

## Operator modules

The web application includes Command Centre, Transactions and Transaction 360, Customers & Identity, Providers and certification, Merchants & Sites, Services & Products, Routing, Devices, Payments & Settlements, Reconciliation, Support, Integration Health, Alerts & Incidents, Analytics and Administration.

Customers & Identity provides a verification queue and customer assurance detail workspace. Identity numbers are displayed only in masked form, phone/email are masked in the operator UI, and service readiness is derived from synchronized NOLI/CPay verification state rather than an operator override.

Provider actions are capability-aware and permission-aware. Financial actions remain enforced by backend state machines, idempotency, maker/checker controls and audit logging.

## Integrated management system

The repository includes an auditable management-system baseline for:

- ISO 9001 quality management;
- ISO/IEC 27001 information security management and ISO/IEC 27000 concepts;
- ISO/IEC 20000-1 service management;
- ISO/IEC 27032 Internet/cybersecurity guidance;
- ISO 22301 business continuity;
- ISO 20022 and ISO 8583 financial-message profile governance;
- ISO 9362 BIC controls;
- ISO 32212 sustainable-finance transition planning where applicable.

Start with `docs/compliance/README.md` and `docs/compliance/ISO_CONTROL_MATRIX.md`. The machine-readable control register is validated by `pnpm governance:check` and is also included in `pnpm repo:check`.

These artefacts establish implementation and evidence requirements; they are not a claim of certification. Management-system certification requires the operating organization to run the processes, retain objective evidence, perform internal audit and management review, close material nonconformities and undergo independent assessment where applicable.

## Local setup

1. Install Node.js 22 and pnpm 10.
2. Copy `.env.example` to a local environment file and use development-only values.
3. Start PostgreSQL and Redis with `docker compose up -d postgres redis`.
4. Run `pnpm install`.
5. Run `pnpm db:migrate` and `pnpm db:seed`.
6. Configure `BOOTSTRAP_ADMIN_EMAIL` and run `pnpm bootstrap:admin` once to create the initial tenant/platform administrator, then remove bootstrap values from runtime environments.
7. Run `pnpm dev`.

Useful checks:

```bash
pnpm repo:check
pnpm governance:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm security:gate
```

## Production deployment

Deploy the web, API, recovery worker and operations worker independently. PostgreSQL is the financial and operational source of truth. Configure OIDC Authorization Code + PKCE, separate `JWT_SECRET` and `AUTH_EXCHANGE_SECRET`, provider secret references, alert routing, metrics protection and private backup storage through the hosting platform secret/configuration system.

Follow `docs/PRODUCTION_RUNBOOK.md`. A deployment is not production-ready until migrations, security checks, OIDC login, provider certification, webhook verification, safe recovery, settlement/reconciliation, alerting and a restore smoke test have been verified.

## Non-negotiable rules

- Core services understand vending concepts; adapters understand providers.
- Payment success is not vending success.
- A provider timeout becomes `UNKNOWN`; never blindly re-vend after payment.
- Post-dispatch failover is prohibited unless an explicitly proven cross-provider recovery contract exists.
- External requests carry correlation IDs and idempotency keys.
- Webhooks are verified, replay-protected, deduplicated, persisted and normalized before domain handling.
- Secrets never enter source control or ordinary business tables.
- Raw customer identification numbers are not exposed by the operator UI; operational review uses masked identity values and provider references.
- High-risk configuration and financial actions require RBAC, approval and immutable audit evidence.
- Tenant isolation is enforced in application logic and PostgreSQL RLS.
- Settlement matching uses explicit provider references, not amount/time guesses.
- Financial-message standards are implemented through approved, versioned profiles at adapter boundaries, never by sprinkling field assumptions through core domain code.
- BIC syntax validation does not replace authoritative BIC directory validation for production routing.

## Documentation

- `docs/BUILD_SPECIFICATION.md` - product and engineering requirements
- `docs/ARCHITECTURE.md` - architecture and responsibility boundaries
- `docs/PHASE1_IMPLEMENTATION.md` through `docs/PHASE5_IMPLEMENTATION.md` - implementation history
- `docs/APPLICATION_COMPLETION.md` - final implemented scope, known configuration dependencies and acceptance checks
- `docs/PRODUCTION_RUNBOOK.md` - deployment, monitoring, backup and recovery operations
- `docs/DEVELOPMENT.md` - developer workflow
- `docs/compliance/` - integrated quality, security, service, continuity, audit and financial-interoperability governance
