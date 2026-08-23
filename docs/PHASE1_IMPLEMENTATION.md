# Phase 1 Control Plane Implementation

Phase 1 establishes executable platform foundations for NOLI Vendaz Back Office.

## Implemented

- Canonical provider, connector, transaction, payment and vending status models.
- Provider adapter SDK contract.
- PostgreSQL persistence package with tenant-scoped transaction helper.
- Initial schema migration for tenants, IAM/RBAC, merchants/sites, providers/connectors/capabilities, services/products, routes, canonical transactions, approvals and append-only audit logs.
- PostgreSQL row-level security for tenant-owned operational tables.
- Seed catalog for RBAC permissions and provider capabilities.
- Fastify API bootstrap with JWT authentication and database-backed permission resolution.
- Provider registry API.
- Connector registry API.
- Connector capability assignment API.
- Health endpoint.
- Authenticated principal-context endpoint.

## Security boundary

JWTs identify the user and tenant, but permissions are loaded from the database on every authenticated request. The token therefore does not become the source of truth for authorization.

Tenant data access is enforced twice:

1. API authorization and principal context.
2. PostgreSQL row-level security using transaction-local `app.tenant_id` and `app.is_platform_admin` settings.

Provider credentials are represented only by secret-manager references. Raw provider secrets must not be stored in `provider_connectors`.

## Initial API

```text
GET  /health
GET  /api/v1/auth/context
GET  /api/v1/providers
POST /api/v1/providers
POST /api/v1/providers/:providerId/connectors
PUT  /api/v1/connectors/:connectorId/capabilities
```

## Database initialization

```bash
pnpm install
pnpm build
pnpm db:migrate
pnpm db:seed
```

Before starting the API set at minimum:

```text
DATABASE_URL=postgresql://...
JWT_SECRET=<minimum 32 character secret>
```

Production deployments must source secrets from the deployment secret manager, not committed environment files.

## Bootstrap dependency

The database intentionally does not create a default production administrator. A deployment/bootstrap procedure must create the first tenant, first user, appropriate role, and role assignments through controlled deployment tooling.

## Next phase

Phase 2 should implement:

1. Native Vending adapter.
2. CPay/ChargeNow adapter.
3. Webhook gateway.
4. Provider event normalization.
5. Canonical transaction ingestion.
6. Transaction 360.
7. Provider health monitoring.
8. Safe `UNKNOWN` transaction resolution.
