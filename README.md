# NOLI Vendaz Back Office

Unified multi-provider vending operations and orchestration control plane for NOLI Vendaz.

This repository is the receiving repository for the NOLI Vendaz back-office application. The back office is designed to manage NOLI-native vending, CPay/ChargeNow-connected vending, and approved third-party vending providers through a common provider, connector, capability, adapter, transaction, reconciliation, support, and audit architecture.

## Product principle

> One operational view, many vending engines.

The Back Office owns cross-provider control, governance, routing, transaction visibility, reconciliation, support, reporting, integration health, approvals, security, and audit. Provider-specific execution stays behind adapters.

## Repository layout

```text
apps/
  backoffice-web/        # Administrator web application
  backoffice-api/        # Back-office HTTP/API boundary
services/
  provider-orchestrator/ # Provider routing and adapter execution
  reconciliation-service/
  webhook-gateway/
adapters/
  native-vending/        # Existing NOLI vending integration
  cpay/                  # CPay / ChargeNow integration
packages/
  canonical-models/      # Shared domain types/contracts
  provider-sdk/          # Adapter interface and certification contracts
infra/                   # Deployment, migrations, monitoring and runtime config
docs/                    # Architecture and implementation guidance
scripts/                 # Repository verification and developer utilities
```

## Technology baseline

The repository is prepared as a Node.js 22 + TypeScript + pnpm workspace. Application frameworks can be finalized during implementation, but provider-specific business logic must never be embedded in shared core services.

## Start here

1. Read `docs/BUILD_SPECIFICATION.md`.
2. Read `docs/ARCHITECTURE.md`.
3. Copy `.env.example` to a local environment file and populate only development credentials.
4. Install Node.js 22 and pnpm 10.
5. Run `pnpm install`.
6. Run `pnpm repo:check`.
7. Add application code inside the existing boundaries rather than creating provider-specific shortcuts.

## Non-negotiable rules

- Core services understand vending concepts; adapters understand providers.
- Payment success is not vending success.
- Provider timeouts become `UNKNOWN` until queried or reconciled. Never blindly retry a paid vend.
- Every external transaction carries a correlation ID and idempotency key.
- Webhooks are verified, deduplicated, persisted, normalized, then processed.
- Secrets never enter source control.
- High-risk configuration and financial actions require RBAC, approval, and audit.
- Tenant and merchant data isolation is mandatory.

## Initial integrations

The first production integrations are:

1. NOLI Native Vending via `adapters/native-vending`.
2. CPay / ChargeNow via `adapters/cpay`.

Additional providers must implement the provider SDK contract and pass certification before production routing.
