# Service Management System (ISO/IEC 20000-1)

## Service catalogue

Each production service must have a controlled service record containing purpose, owner, users/customers, dependencies, availability target, support hours, incident priority model, security classification, continuity tier, RTO/RPO, monitoring, supplier dependencies and change authority.

Initial catalogue:

| Service | Purpose | Continuity tier | Initial SLO |
| --- | --- | --- | --- |
| Back Office Web | Operator interface | Tier 2 | 99.5% monthly |
| Back Office API | Canonical operational/financial control plane | Tier 1 | 99.9% monthly |
| Provider Orchestration | Route and execute approved provider capabilities | Tier 1 | 99.9% monthly excluding provider outages |
| Webhook Processing | Verify, persist and normalize provider callbacks | Tier 1 | 99.9% monthly |
| Recovery Worker | Resolve UNKNOWN/refund recovery safely | Tier 1 | 99.5% cycle completion within interval |
| Operations Worker | Health, alert and credential monitoring | Tier 2 | 99.5% cycle completion within interval |
| PostgreSQL | Authoritative state | Tier 1 | platform target plus tested recovery objectives |
| Backup/Restore | Recoverability and evidence | Tier 1 | daily backup; monthly restore test |

Targets are baselines and must be approved against business/customer obligations before contractual use.

## Incident management

Priorities:

- **P1 Critical**: financial integrity risk, broad outage, security compromise, unrecoverable transaction ambiguity or inability to operate a Tier 1 service.
- **P2 High**: material degradation, significant provider outage, high-impact customer/merchant issue with workaround.
- **P3 Medium**: localized service defect or moderate degradation.
- **P4 Low**: low-impact issue/request.

Initial targets:

| Priority | Acknowledge | Operational update | Target restore/workaround |
| --- | --- | --- | --- |
| P1 | 15 min | 30 min | 4 h |
| P2 | 30 min | 60 min | 8 h |
| P3 | 4 business h | daily | 3 business days |
| P4 | 1 business day | as agreed | planned backlog/request |

Contractual SLAs override these baselines when stricter.

Every P1/P2 requires incident commander/owner, timeline, impact, communications, recovery evidence and post-incident review.

## Problem management

Create a problem record when incidents repeat, root cause is unknown/material, or a single event exposes systemic risk. Problem records contain linked incidents, root cause, known error/workaround, corrective changes, residual risk and effectiveness review.

## Change management

Classify changes:

- **Standard**: pre-authorized, low-risk, repeatable, documented and tested.
- **Normal**: risk assessed, reviewed and authorized before implementation.
- **Emergency**: necessary to resolve/avoid material harm; minimum safe review before action and mandatory retrospective review within 2 business days.

Change records include scope, reason, services/tenants/providers affected, risk, security/continuity impact, test evidence, migration, implementation window, communication, rollback/forward-fix, approver and post-deployment verification.

High-risk changes require maker/checker or change-authority approval, including production routing, provider credentials, payment/refund logic, settlement/reconciliation logic, tenant/RBAC/RLS, cryptography, backup/restore and destructive migrations.

## Release and deployment management

A release is a controlled package of approved changes. Deployment requires:

- green CI/security gates;
- approved migrations and compatibility plan;
- version/release identifier;
- release notes for material operator changes;
- operational/runbook updates;
- monitoring/alert readiness;
- provider certification where interfaces changed;
- deployment verification;
- recorded outcome and rollback/forward-fix decision.

## Service request management

Standard requests such as user provisioning, role assignment, provider onboarding, access changes and report requests must have defined authorization, fulfilment target and evidence. Requests cannot bypass privileged approval controls merely because someone called them a ticket.

## Service configuration management

Maintain controlled configuration information for:

- services and deployment versions;
- environments;
- provider connectors and approved capabilities;
- service/provider dependencies;
- routes and merchant mappings;
- database schema version;
- critical secrets by reference/owner/expiry metadata, never secret value;
- domains/certificates;
- alert/monitoring configuration;
- backup destinations and retention policy.

## Availability and capacity

Review monthly:

- service availability and error budget;
- API latency/error rates;
- database connection/storage growth;
- webhook backlog/delay;
- worker cycle duration/backlog;
- provider latency/timeouts;
- reconciliation exception age/volume;
- transaction volume peaks;
- backup duration/size;
- resource saturation and forecast.

Capacity changes follow change management.

## Service continuity

IT service continuity aligns to `BCMS.md`. Tier 1 services must have documented recovery procedures and tested dependencies. Continuity tests produce evidence and actions.

## Supplier management

For each critical supplier/provider define service owner, contract/SLA, support/escalation path, dependency, monitoring, continuity expectation, security obligation, incident notification, review frequency and exit plan.

Provider health can alter routing only according to approved routing/safety rules. No automatic post-dispatch failover is permitted unless explicitly proven safe.

## Service reporting and review

Monthly service review includes:

- availability/SLO performance;
- incidents and SLA breaches;
- problems and known errors;
- changes/releases and failed changes;
- capacity trends;
- security events/vulnerabilities;
- provider/supplier performance;
- customer/support metrics;
- continuity/backup results;
- improvement actions.

Quarterly integrated management review escalates persistent issues, resources, risks and objectives.