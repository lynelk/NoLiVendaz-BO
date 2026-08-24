# ISO Control Matrix and Gap Assessment

Status meanings:

- **IMPLEMENTED**: repository/application contains the control mechanism; operating evidence is still required.
- **PARTIAL**: useful controls exist but process/evidence or coverage is incomplete.
- **FRAMEWORK**: controlled process is now defined by this uplift but requires organization adoption/evidence.
- **CONDITIONAL**: only applicable when a specific business/interface scope exists.

| Domain | Standard(s) | Status after uplift | NOLI control/evidence | Remaining organization action |
| --- | --- | --- | --- | --- |
| IMS scope/policy | 9001, 27001, 20000-1, 22301 | FRAMEWORK | `INTEGRATED_POLICY.md`, scope | executive approval/effective date |
| Context/interested parties | 9001, 27001, 20000-1, 22301 | FRAMEWORK | compliance framework | maintain interested-party/obligation register |
| Objectives/KPIs | 9001, 27001, 20000-1 | FRAMEWORK | QMS/ITSM objectives | approve targets; collect results |
| Risk management | 27001, 22301, 9001 | FRAMEWORK | ISMS 5x5 method | populate risk register and treatments |
| Statement of Applicability | 27001 | FRAMEWORK | SoA requirement/control register | complete Annex A applicability with evidence |
| Tenant isolation | 27001 | IMPLEMENTED | PostgreSQL RLS + application tenant context | periodic control testing |
| RBAC/least privilege | 27001 | IMPLEMENTED | database-authoritative RBAC, permissions | access-review evidence |
| MFA/identity | 27001, 27032 | PARTIAL | OIDC architecture and MFA policy | production IdP MFA/config/evidence |
| Maker/checker | 27001, 9001, 20000-1 | IMPLEMENTED | high-risk approvals/refund/routing controls | periodic sampling |
| Secrets management | 27001, 27032 | PARTIAL | secret-reference architecture; no source secrets | production vault/rotation evidence |
| Secure SDLC | 27001, 9001 | IMPLEMENTED | PR workflow, test/build, CodeQL, dependency audit | maintain evidence/exception process |
| Vulnerability mgmt | 27001, 27032 | FRAMEWORK | Security CI + remediation targets | recurring review and exception register |
| Logging/audit | 27001, 20000-1 | IMPLEMENTED | append-only audit/financial events | retention/monitoring evidence |
| Webhook security | 27001, 27032 | IMPLEMENTED | signature/freshness/replay/dedupe pipeline | provider certification evidence |
| Financial idempotency | 9001, 27001, 20000-1 | IMPLEMENTED | idempotent requests; no blind paid-vend retry | control tests/incidents |
| Provider certification | 9001, 20000-1, 27001 | IMPLEMENTED | connector lifecycle/certification | certify every production profile |
| Supplier management | 9001, 27001, 20000-1, 22301 | FRAMEWORK | supplier due-diligence criteria | contractual reviews and evidence |
| Service catalogue | 20000-1 | FRAMEWORK | `ITSM.md` initial catalogue | approve owners/SLOs/SLAs |
| Incident management | 20000-1, 27001, 22301 | IMPLEMENTED+FRAMEWORK | incidents/alerts plus priority process | operate records and PIRs |
| Problem management | 20000-1, 9001 | FRAMEWORK | problem/CAPA criteria | establish problem register/workflow |
| Change/release management | 20000-1, 9001, 27001 | IMPLEMENTED+FRAMEWORK | GitHub/CI/deployment gates + change rules | maintain formal change evidence |
| Configuration management | 20000-1 | PARTIAL | provider/config/database/deployment metadata | maintain CI/service configuration inventory |
| Availability/capacity | 20000-1 | PARTIAL | metrics/readiness/provider health | approve SLOs; monthly trend review |
| Service reporting | 20000-1, 9001 | FRAMEWORK | monthly review definition | generate service reports |
| BIA | 22301 | FRAMEWORK | `BCMS.md` method | management-approved BIA |
| RTO/RPO | 22301, 20000-1 | FRAMEWORK | initial tiered objectives | approve against contracts/business impact |
| Backup | 22301, 27001 | IMPLEMENTED | daily backup tooling/checksum/private target design | activate infrastructure; daily evidence |
| Restore/DR testing | 22301 | IMPLEMENTED+FRAMEWORK | restore smoke tooling + exercise cadence | monthly/annual test evidence |
| Crisis communications | 22301 | FRAMEWORK | crisis roles/communications plan | maintain contact lists/templates |
| Cyber collaboration | 27032 | FRAMEWORK | stakeholder/provider incident sharing | establish escalation contacts/procedure |
| ISO 20022 profile governance | 20022 | CONDITIONAL+FRAMEWORK | approved-profile lifecycle/mapping rules | load official RA definitions/profile tests when interface exists |
| ISO 8583 profile governance | 8583:2023 | CONDITIONAL+FRAMEWORK | approved network/profile lifecycle | certify exact network profile when interface exists |
| BIC syntax validation | 9362:2022 | CONDITIONAL+IMPLEMENTED | `@nolivendaz/financial-messaging` syntax helper | use authoritative BIC directory for production routing |
| Financial-message evidence | 20022, 8583, 9362 | CONDITIONAL+FRAMEWORK | message envelope/profile metadata design | integrate into applicable adapters/storage |
| Cross-currency analytics | 9001, 20022 | IMPLEMENTED | currency-grouped analytics design | monitor/report correctly |
| ISO 32212 applicability | 32212:2026 | FRAMEWORK | formal applicability rule | executive scope decision |
| Transition objectives/targets | 32212:2026 | CONDITIONAL+FRAMEWORK | sustainable-finance framework | baseline/data/targets if applicable |
| Internal audit | 9001, 27001, 20000-1, 22301, 32212 | FRAMEWORK | audit programme | appoint auditors; execute programme |
| CAPA | 9001, 27001, 20000-1, 22301, 32212 | FRAMEWORK | CAPA lifecycle/effectiveness | operate register and evidence |
| Management review | 9001, 27001, 20000-1, 22301 | FRAMEWORK | integrated agenda | conduct/approve minutes/actions |
| Document/evidence control | all management standards | FRAMEWORK | Git-controlled documents + evidence principles | assign owners/review dates/retention |

## Priority closure plan

### P0 before any conformity/certification claim

1. Executive approval of scope/policies and process/control owners.
2. Populate risk register and ISO/IEC 27001 Statement of Applicability.
3. Activate production database/backup infrastructure and evidence restore testing.
4. Configure production OIDC/MFA, secret store and access reviews.
5. Approve service catalogue/SLO/SLA and incident/change/problem procedures.
6. Approve BIA/RTO/RPO and execute continuity tests.
7. Establish supplier register and critical-provider due diligence.
8. Implement evidence retention and internal audit programme.
9. Conduct management review and close material CAPAs.
10. Confirm the applicability of ISO 32212 and financial-message standards per actual legal/entity/interface scope.

### P1 application enhancements

1. Integrate financial-message profile/evidence metadata into adapters that actually use ISO 20022/8583.
2. Add authoritative BIC directory validation for routing interfaces that use BIC.
3. Add a formal compliance/risk/evidence module or integrate an approved GRC system if operational volume warrants it.
4. Add supplier/contract/SLA metadata and review reminders.
5. Automate evidence snapshots for access, CI, deployments, backups, restore tests and service KPIs.

## Important limitation

This matrix is an implementation baseline and gap analysis, not a certificate or legal opinion. Management-system conformity depends on actual operation, evidence and independent assessment. Financial-message conformity depends on the exact approved message/network profile, not merely using the ISO standard number.