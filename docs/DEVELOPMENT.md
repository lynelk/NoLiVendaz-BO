# Development Guide

## Prerequisites

- Node.js 22
- pnpm 10
- Docker with Compose support

## Local infrastructure

Start PostgreSQL and Redis:

```bash
docker compose up -d postgres redis
```

Copy `.env.example` to a local environment file and populate development-only values. Never place production credentials in source or committed environment files.

Install dependencies and initialize persistence:

```bash
pnpm install
pnpm repo:check
pnpm db:migrate
pnpm db:seed
```

For the first local administrator, set `BOOTSTRAP_TENANT_CODE`, `BOOTSTRAP_TENANT_NAME`, `BOOTSTRAP_ADMIN_EMAIL` and optionally `BOOTSTRAP_ADMIN_NAME`, then run:

```bash
pnpm bootstrap:admin
```

Remove bootstrap values after use. The command is intended for first-operator setup, not normal user lifecycle management.

## Running the application

Run all workspace development tasks through Turborepo:

```bash
pnpm dev
```

The runtime architecture consists of the operator web application, API, recovery worker and operations worker. Workers should run as independent processes in deployed environments.

For local UI development without an OIDC provider, `BACKOFFICE_DEV_BEARER_TOKEN` may be used with a development API token. This escape hatch is not a production authentication mechanism and must not be configured in production.

## Quality checks

Before opening a PR:

```bash
pnpm repo:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm security:gate
```

The root build includes the Next.js framework security gate. Security CI also performs production dependency auditing and CodeQL analysis.

## Workspace boundaries

- `apps/*` contains user-facing deployable applications.
- `services/*` contains independently deployable backend/worker services.
- `adapters/*` contains provider-specific integrations.
- `packages/*` contains shared libraries and contracts.
- `infra/*` contains migrations, deployment, backup and operational infrastructure assets.

Provider-specific schemas, authentication, field/status/error mappings, raw payload parsing and provider HTTP calls belong in `adapters/<provider>` or provider-runtime configuration consumed by an adapter.

Shared services depend on canonical interfaces from `packages/provider-sdk` and `packages/canonical-models`; they must not branch on concrete provider names.

## Database changes

Add forward-compatible migrations in lexical order under `infra/migrations`. Do not rewrite already-applied migrations. Tenant-owned entities require deliberate RLS policy review. Financial/state-machine changes should include concurrency/idempotency review and tests for replay behavior.

## Provider development

A provider is not production-ready merely because it responds to a health check. Configure capabilities and runtime mappings, exercise sandbox behavior, validate signatures/idempotency/status mappings, run certification and obtain the required approval before production routing.
