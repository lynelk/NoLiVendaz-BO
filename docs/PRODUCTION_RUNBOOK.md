# Production Runbook

## Management-system gate

Production operation is governed by `docs/compliance/`. Every material release/change must identify affected services, risk, security/continuity impact, rollback/forward-fix, approval and objective evidence. Emergency changes require retrospective review within 2 business days.

## Services

Deploy four independent processes: `backoffice-web`, `backoffice-api`, `recovery-worker`, and `operations-worker`. PostgreSQL is authoritative persistence; Redis is supporting cache/queue infrastructure and is not a financial source of truth.

Service owners, continuity tiers and baseline SLOs are maintained in `docs/compliance/ITSM.md`. RTO/RPO baselines and recovery sequence are maintained in `docs/compliance/BCMS.md`.

## Startup order

1. Provision PostgreSQL, Redis where required, and private backup destination.
2. Verify backup destination credentials and access separation.
3. Apply migrations in lexical order and run controlled seeds.
4. Configure API/web shared `JWT_SECRET` and `AUTH_EXCHANGE_SECRET` through the hosting platform secret store.
5. Configure OIDC endpoints/client credentials, require privileged MFA at the identity provider and provision operator email addresses in `users`.
6. Configure provider credential references. Production values remain environment/file secret references, never database plaintext.
7. Verify approved provider/message profile versions and certification evidence.
8. Start API and require `/ready` to return 200 against the expected application schema.
9. Start recovery and operations workers.
10. Start web and verify OIDC login, least privilege, Command Centre and Transaction 360.
11. Verify webhook authenticity/replay handling and provider health.
12. Record deployment/change evidence and post-deployment verification.

## Monitoring

Scrape `/metrics` from a private network or use `METRICS_TOKEN`. Alert on API readiness failure, provider `OUTAGE`, unknown financial exposure, critical reconciliation exceptions, recovery escalation, credential expiry and repeated webhook failures. The operations worker persists alert evidence even when external alert delivery is unavailable.

Monitor at minimum:

- API availability, latency, 4xx/5xx and saturation;
- database connectivity/storage/connections;
- webhook verification failures, age and backlog;
- provider availability/latency/timeouts;
- UNKNOWN transaction exposure and age;
- refunds/reversals awaiting action;
- reconciliation exception count/value/age by currency;
- worker cycle success/duration/backlog;
- privileged authentication/admin events;
- backup completion/size/age;
- domain/TLS and critical credential expiry.

## Incident and problem management

Use the priority model and response targets in `docs/compliance/ITSM.md`. P1/P2 incidents require an owner/commander, timeline, impact, stakeholder updates, recovery evidence and post-incident review. Repeated incidents or systemic root causes require a problem record and corrective action.

For security incidents also follow `SECURITY.md` and `docs/compliance/ISMS.md`.

For continuity invocation follow `docs/compliance/BCMS.md`.

## Financial-integrity stop conditions

Stop or restrict unsafe writes/routes when:

- authoritative transaction/database state cannot be established;
- duplicate money movement is suspected;
- paid vending has ambiguous outcomes that cannot be safely queried/reconciled;
- webhook authenticity/replay controls are materially bypassed;
- a financial-message profile/version is unknown or uncertified;
- BIC/party routing depends on an identifier that cannot be authoritatively validated;
- reconciliation exposes systemic mismatch beyond approved tolerance.

Availability targets never override financial integrity.

## Backup / DR

Run `infra/backup/backup.sh` at least daily using an S3-compatible private bucket. Prefer object-storage lifecycle retention rather than destructive application-side deletion. Keep at least 30 daily restore points plus longer monthly copies where required.

Perform a restore smoke test at least monthly with `infra/backup/restore-smoke.sh`. A backup is not considered valid until it has been restored and basic tenant/audit/transaction queries succeed. Record tested object key/version, timestamps, operator, result, exceptions and corrective actions.

Perform at least annual end-to-end disaster-recovery exercise covering database restore, application recovery, authentication, provider/reconciliation visibility and business validation. Measure actual RTO/RPO against approved targets.

## Access and security operations

- privileged access review quarterly;
- all workforce access review at least semiannually;
- prompt joiner/mover/leaver handling;
- break-glass use is time-bound and retrospectively reviewed;
- security/dependency findings reviewed at least monthly;
- critical supplier/provider security and service performance reviewed periodically;
- no production secret value is copied into tickets, logs, docs or GitHub comments.

## Deployment gates

- `pnpm repo:check` passes, including governance/control-register validation.
- `pnpm lint`, `pnpm typecheck`, tests and build pass.
- `pnpm security:gate` passes.
- No unresolved critical/high dependency advisory accepted without documented, time-bound exception.
- Database migrations reviewed and backed up before production application.
- Service/security/continuity/financial-message impacts are recorded in the change/PR.
- Provider production activation remains maker/checker governed.
- Applicable provider/message profile certification is current.
- Required runbooks/training/monitoring are updated.
- Next.js 16.3.0 must not be deployed after August 26, 2026; the build gate enforces this until the scheduled security release is applied.

## Post-deployment verification

Confirm:

1. expected commit/image/version is running;
2. `/ready` and critical dependencies are healthy;
3. authentication/RBAC works for representative roles;
4. tenant isolation smoke checks pass;
5. provider health/certification state is expected;
6. transaction create/read lifecycle behaves as expected where safe to test;
7. webhook processing and reconciliation remain healthy;
8. workers complete cycles;
9. monitoring/alerts receive test evidence where appropriate;
10. no unexpected financial/security exceptions were introduced.

Record outcome in the change evidence.

## Rollback

Application containers are immutable and can be rolled back independently. Do not automatically roll back destructive database migrations. Prefer forward-compatible migrations, expand/contract changes and explicit rollback SQL where a migration is operationally reversible.

A rollback must not create duplicate external writes, replay financial requests or revert canonical state in a way that conflicts with already-executed provider actions. When financial state changed externally, prefer a controlled forward fix/reconciliation over blindly restoring old application state.

## Service review evidence

Monthly service review records SLO/SLA performance, incidents/problems, failed changes, security findings, capacity, provider/supplier performance, customer/support metrics, reconciliation exposure, backup/restore outcomes and improvement actions. Quarterly integrated management review escalates persistent risks, objectives and resource decisions.