# Audit, Evidence, CAPA and Management Review

## Documented information control

Controlled management-system documents must identify title/purpose, owner, approver where required, version/effective date through source control or approved DMS, review frequency and classification.

Changes are made through reviewable change records. Superseded procedures must not remain presented as current operational instructions.

## Evidence principles

Objective evidence must be:

- attributable to an actor/system;
- timestamped;
- linked to the relevant service/control/change/incident where practical;
- protected from unauthorized alteration;
- retained for an approved period;
- searchable/retrievable for audit;
- appropriately classified and access-controlled;
- minimized so evidence collection does not become a new sensitive-data leak.

## Evidence register

Maintain evidence for at least these control families:

| Evidence | Minimum cadence / trigger | Typical source |
| --- | --- | --- |
| risk register/treatment review | quarterly and major change | compliance repository |
| Statement of Applicability | annual and control-scope change | compliance repository |
| quality objectives/KPIs | monthly/quarterly | service analytics |
| privileged access review | quarterly | IdP/RBAC/database export |
| all-user access review | semiannual | IdP/RBAC export |
| vulnerability review | monthly/continuous | CI/security tools |
| supplier/provider review | at least annual; critical quarterly performance | contracts/provider analytics |
| service/SLA review | monthly | monitoring/support |
| incidents/problems | event-driven | incident system |
| change/release records | every production change | GitHub/deployment/change record |
| provider certification | before production and material profile change | certification harness/results |
| reconciliation control | continuous + monthly summary | application/database |
| backup result | daily | backup platform/log |
| restore smoke test | monthly | restore evidence |
| full DR exercise | annual | exercise report |
| customer feedback/complaints | continuous + monthly review | support/CRM |
| internal audit | annual programme | audit reports |
| management review | at least annual; recommended quarterly integrated review | approved minutes/actions |
| financial-message profile certification | before activation/version change | test evidence/profile register |
| BIC authoritative validation | profile/counterparty onboarding and refresh | approved directory/source |
| ISO 32212 performance | annual where applicable | transition plan evidence |

## Internal audit programme

The audit programme is risk-based and covers the full integrated management-system scope over a defined cycle. High-risk financial/security/service processes are sampled more frequently.

Auditors should be independent of the work audited where practicable. Audit reports record scope, criteria, evidence sampled, conformity, nonconformities, observations/opportunities, owner, due date and closure evidence.

Minimum annual audit themes:

- management-system governance and objectives;
- tenant/RBAC/privileged access;
- secure SDLC/release/change management;
- provider onboarding/certification/supplier controls;
- transaction safety/idempotency/UNKNOWN recovery;
- refund/reversal/maker-checker controls;
- reconciliation/settlement evidence;
- incident/problem/security response;
- backup/restore/continuity;
- financial-message profile governance where applicable;
- document/record control;
- ISO 32212 governance where applicable.

## Nonconformity classification

- **Major**: systemic absence/failure of a required process/control, material financial/security/customer risk, or evidence that the management system cannot achieve intended outcomes.
- **Minor**: isolated lapse that does not indicate systemic failure but requires correction.
- **Observation**: improvement opportunity or emerging weakness not yet a nonconformity.

## Corrective action

Every major/minor nonconformity records:

- requirement/control;
- factual evidence;
- immediate correction/containment;
- impact and affected scope;
- root cause;
- corrective action;
- owner/due date;
- residual risk;
- effectiveness-check method/date/result;
- closure approver.

Major findings cannot be closed by changing wording alone when the failed control has not been implemented or evidenced.

## Management review agenda

At least annually, preferably quarterly integrated reviews, management evaluates:

1. status of previous actions;
2. internal/external changes and interested-party obligations;
3. quality/service/security/continuity objectives;
4. customer feedback and complaints;
5. process/service performance and SLA/SLO trends;
6. incidents, problems and financial exceptions;
7. security events, vulnerabilities and access reviews;
8. risk register, treatment and risk acceptance;
9. supplier/provider performance;
10. audit/control-test outcomes;
11. nonconformities and CAPA effectiveness;
12. resource, competence and tooling needs;
13. continuity exercises and actual disruptions;
14. financial-message/profile changes;
15. sustainable-finance transition performance where applicable;
16. opportunities for improvement.

Outputs include approved decisions, changed objectives, resources, risk actions, improvement priorities and owners/due dates.

## Metrics quality

Metrics used for management decisions must identify definition, data source, calculation, owner and limitations. Cross-currency financial values must never be aggregated into a single monetary total without explicit currency grouping or an approved exchange-rate methodology.