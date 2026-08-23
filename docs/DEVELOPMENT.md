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

Copy `.env.example` to `.env.local` or the environment convention selected by the application package. Never put production credentials in local files.

Install dependencies:

```bash
pnpm install
pnpm repo:check
```

## Adding a package

Create the package in the appropriate workspace:

- `apps/*` for user-facing deployable applications;
- `services/*` for independently deployable backend services;
- `adapters/*` for provider-specific integrations;
- `packages/*` for shared libraries/contracts.

Every application package should eventually expose `build`, `lint`, `typecheck`, and `test` scripts so root Turborepo tasks can execute consistently.

## Provider changes

Provider-specific schemas, authentication, status mappings, error mappings, raw payload parsing, and API calls belong inside `adapters/<provider>`.

Shared services may depend on canonical interfaces from `packages/provider-sdk` and `packages/canonical-models`, not concrete provider implementations.
