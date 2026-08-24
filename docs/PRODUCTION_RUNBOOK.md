# Production Runbook

## Services

Deploy four independent processes: `backoffice-web`, `backoffice-api`, `recovery-worker`, and `operations-worker`. PostgreSQL is authoritative persistence; Redis is reserved for future distributed caching/queues and is not a financial source of truth.

## Startup order

1. Provision PostgreSQL and backup destination.
2. Apply migrations in lexical order and run seeds.
3. Configure API/web shared `JWT_SECRET` and `AUTH_EXCHANGE_SECRET` through the hosting platform secret store.
4. Configure OIDC endpoints/client credentials and provision operator email addresses in `users`.
5. Configure provider credential references. Production values remain environment/file secret references, never database plaintext.
6. Start API and require `/ready` to return 200.
7. Start recovery and operations workers.
8. Start web and verify OIDC login, Command Centre and Transaction 360.

## Monitoring

Scrape `/metrics` from a private network or use `METRICS_TOKEN`. Alert on API readiness failure, provider `OUTAGE`, unknown financial exposure, critical reconciliation exceptions, recovery escalation, credential expiry and repeated webhook failures. The operations worker persists alert evidence even when external alert delivery is unavailable.

## Backup / DR

Run `infra/backup/backup.sh` at least daily using an S3-compatible private bucket. Prefer object-storage lifecycle retention rather than destructive application-side deletion. Keep at least 30 daily restore points plus longer monthly copies where required.

Perform a restore smoke test at least monthly with `infra/backup/restore-smoke.sh`. A backup is not considered valid until it has been restored and basic tenant/audit/transaction queries succeed. Record the tested object key, timestamp and operator in the change/operations log.

## Deployment gates

- `pnpm repo:check`, lint, typecheck, tests and build pass.
- `pnpm security:gate` passes.
- No unresolved critical/high dependency advisory accepted without documented exception.
- Database migrations reviewed and backed up before production application.
- Provider production activation remains maker/checker governed.
- Next.js 16.3.0 must not be deployed after August 26, 2026; the build gate enforces this until the scheduled security release is applied.

## Rollback

Application containers are immutable and can be rolled back independently. Do not automatically roll back destructive database migrations. Prefer forward-compatible migrations, expand/contract changes and explicit rollback SQL where a migration is operationally reversible.
