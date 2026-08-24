# NOLI Vendaz Back Office Web

Next.js operator console for the NOLI Vendaz multi-provider vending control plane.

## Implemented workspaces

1. Command Centre
2. Transactions
3. Transaction 360
4. Providers and Provider Operations
5. Merchants & Sites
6. Services & Products
7. Routing
8. Devices
9. Payments & Settlements
10. Reconciliation
11. Support
12. Integration Health
13. Alerts & Incidents
14. Analytics & Reports
15. Administration

The UI is server-rendered where practical and uses a server-only API client. Production access uses OIDC Authorization Code + PKCE and stores the internal API session in an HttpOnly cookie. Browser JavaScript does not receive the bearer token.

Provider-specific actions are shown only when the connector advertises the required capability and the operator has the required permission. Backend state machines remain authoritative even when an action is visible in the UI.

## Development

```bash
pnpm --filter @nolivendaz/backoffice-web dev
pnpm --filter @nolivendaz/backoffice-web typecheck
pnpm --filter @nolivendaz/backoffice-web build
```

Use `BACKOFFICE_DEV_BEARER_TOKEN` only for local development. It must not be set in production.

## Production security

The application ships security headers, standalone output, server-only API token forwarding and a framework security gate. The repository intentionally blocks continued production use of Next.js 16.3.0 on or after August 26, 2026 until the scheduled security release is applied.
