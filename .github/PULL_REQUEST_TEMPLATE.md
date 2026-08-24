## Summary

Describe the change, customer/operational problem, expected outcome and acceptance criteria.

## Domain

- [ ] Back-office web
- [ ] Back-office API
- [ ] Provider orchestration
- [ ] Provider adapter
- [ ] Payments / settlement
- [ ] Reconciliation
- [ ] Support
- [ ] Security / IAM
- [ ] Infrastructure / continuity
- [ ] Financial messaging / identifiers
- [ ] Documentation / management system

## Change classification

- [ ] Standard change (pre-authorized, low-risk, repeatable)
- [ ] Normal change (risk assessed and approved before production)
- [ ] Emergency change (minimum safe review; retrospective review required)

Risk rating: `LOW / MODERATE / HIGH / CRITICAL`

## Integrated management-system impact

Document `N/A` with rationale where not applicable.

- **Quality / ISO 9001:** customer requirements, acceptance criteria, process/KPI/nonconformity impact.
- **Security / ISO/IEC 27001 & 27032:** threat, data classification, access, secrets, logging, vulnerability and supplier impact.
- **Service / ISO/IEC 20000-1:** affected service/SLO, capacity, availability, incident/problem/configuration/runbook impact.
- **Continuity / ISO 22301:** BIA/RTO/RPO, backup, recovery, degraded-mode or crisis-plan impact.
- **Financial interoperability:** ISO 20022/8583 profile/version, BIC, reconciliation or mapping impact when applicable.
- **Sustainable finance / ISO 32212:** transition-plan or climate-data/decision impact when applicable.
- **Compliance/evidence:** control IDs from `docs/compliance/CONTROL_REGISTER.json` affected by this change.

## Safety checks

- [ ] No credentials or production secrets are included.
- [ ] Tenant isolation remains enforced.
- [ ] Least privilege and maker/checker boundaries remain appropriate.
- [ ] Provider-specific logic remains inside an adapter/profile boundary.
- [ ] External writes use idempotency where applicable.
- [ ] Timeout behavior does not blindly repeat paid vending or money movement.
- [ ] Post-dispatch failover is not introduced without an explicitly proven recovery contract.
- [ ] Webhook changes verify authenticity, freshness and replay protection.
- [ ] Sensitive actions and financial state transitions are auditable.
- [ ] Cross-currency reporting does not aggregate unlike currencies without an approved FX methodology.
- [ ] Sensitive/regulated data is not added to ordinary logs or analytics exports.
- [ ] Tests include negative/boundary/failure cases appropriate to the risk.
- [ ] Relevant controlled documentation/runbooks are updated.

## Financial-message profile checks (when applicable)

- [ ] Exact standard/profile/message-definition/network version is recorded.
- [ ] Mapping changes are versioned and certified.
- [ ] BIC use includes authoritative validation, not syntax-only routing.
- [ ] Duplicate, timeout, reject, reversal/return and reconciliation behavior is tested.
- [ ] Raw-message evidence is minimized, protected and linked by digest/reference.

## Deployment / migration plan

Describe database migrations, configuration/environment variables, provider coordination, feature flags, release window, monitoring and post-deployment verification.

## Rollback / forward-fix

Describe safe rollback or forward-fix. Explicitly state whether database/data changes are reversible and how financial state is protected during rollback.

## Evidence

Link CI/security runs, tests, screenshots where useful, provider certification, change approval, migration evidence and any updated risk/control records.