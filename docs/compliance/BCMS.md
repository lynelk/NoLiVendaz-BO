# Business Continuity Management System (ISO 22301)

## Continuity objective

NOLI Vendaz shall maintain predefined minimum service capacity during disruption and recover priority services within management-approved recovery objectives while protecting financial integrity, security and evidence.

Continuity is not permission to bypass transaction safety. During degradation, duplicate money movement is worse than delayed vending.

## Business impact analysis

The BIA is reviewed at least annually and after material service/business changes. For each process/service record:

- business purpose and owner;
- customers/tenants/providers affected;
- maximum tolerable period of disruption;
- minimum acceptable capacity;
- RTO and RPO;
- financial, customer, regulatory, contractual, safety and reputation impact by time band;
- critical people, systems, suppliers, facilities, information and communications;
- manual/degraded-mode procedure;
- recovery dependencies and sequencing.

## Initial recovery objectives

These are engineering baselines pending formal management approval and contractual reconciliation:

| Capability | Tier | RTO | RPO | Degraded-mode principle |
| --- | --- | --- | --- | --- |
| Authoritative PostgreSQL data | 1 | 4 h | 24 h maximum from daily backup; target <= 15 min where managed PITR is enabled | stop unsafe writes until authoritative state is known |
| Back Office API | 1 | 2 h | state held in PostgreSQL | restore read/triage first, then controlled writes |
| Webhook intake/processing | 1 | 2 h | zero accepted-event loss target | persist before process; provider replay/poll reconciliation |
| Provider orchestration | 1 | 2 h | transaction state in PostgreSQL | disable unsafe routes; do not post-dispatch fail over blindly |
| Recovery worker | 1 | 4 h | queue state derived from authoritative records | manual UNKNOWN review if worker unavailable |
| Web operator console | 2 | 8 h | no independent authoritative state | API/manual approved tools may be used by privileged responders |
| Operations worker/alerts | 2 | 4 h | alert evidence in PostgreSQL | direct monitoring/provider escalation |
| Analytics/reporting | 3 | 24 h | recover from authoritative data | defer non-critical reporting |

If the hosting platform supports point-in-time database recovery, the production RPO should be reduced and tested accordingly.

## Disruption scenarios

Plans must cover at minimum:

- primary hosting-region/platform outage;
- PostgreSQL corruption/unavailability;
- deployment causing Tier 1 outage;
- identity-provider outage;
- critical provider/CPay outage;
- webhook-delivery outage/backlog;
- credential/key compromise;
- DDoS/Internet-edge attack;
- ransomware/destructive administrative action;
- staff unavailability/loss of key operator;
- backup destination failure;
- DNS/domain/certificate failure;
- data-integrity or reconciliation crisis;
- supplier termination or prolonged failure.

## Continuity strategies

- immutable application artifacts and independently deployable runtime services;
- managed database durability plus tested backups and restore procedures;
- private, separate backup storage and retention;
- infrastructure/configuration documentation sufficient to rebuild services;
- provider capability and route isolation so one provider outage does not corrupt unrelated state;
- documented manual financial exception handling;
- least privilege and maker/checker reducing destructive action risk;
- separate production/non-production credentials;
- alerting and provider/customer communication paths independent of the failed component where practicable;
- cross-trained operational roles and maintained runbooks.

## Crisis roles

- **Crisis lead**: overall priorities, executive decisions and external escalation.
- **Incident commander**: technical/operational coordination and timeline.
- **Financial integrity lead**: transaction exposure, reconciliation, refunds/reversals and unsafe-operation stop/go decisions.
- **Security lead**: cyber containment, evidence and notification assessment.
- **Service owner**: recovery and customer/service impact.
- **Communications lead**: consistent stakeholder updates.
- **Scribe/evidence owner**: timeline, decisions, approvals and recovery evidence.

One person may hold multiple roles for a small team, but conflicting approval duties must remain separated where maker/checker is required.

## Invocation and escalation

Invoke continuity/crisis procedures when a P1 incident threatens approved RTO/RPO, causes material financial uncertainty, affects multiple tenants/providers, creates a major security event or exceeds ordinary incident-management capacity.

The crisis lead records invocation time, scope, decision basis, minimum service priorities and next review interval.

## Recovery sequence

1. protect people and preserve evidence;
2. contain security/financial-integrity risk;
3. establish authoritative database state;
4. restore authentication and Tier 1 API/read visibility;
5. restore webhook/event intake and reconciliation capability;
6. restore provider orchestration using verified connector state;
7. restore recovery worker;
8. validate critical transaction/refund/settlement state;
9. restore operator web and operations monitoring;
10. restore lower-priority reporting;
11. reconcile backlog and communicate service restoration;
12. conduct post-incident review and corrective action.

## Backup and restore assurance

- backup at least daily;
- keep at least 30 daily restore points unless stronger legal/contractual requirements apply;
- maintain longer monthly copies where approved;
- checksum backups;
- restrict backup credentials and access;
- monthly restore smoke test;
- at least annual full disaster-recovery exercise involving application/service restoration and business validation;
- evidence tested object/version, timestamps, operator, result, exceptions and corrective actions.

A backup that has never been restored is optimism in object storage.

## Exercising programme

| Exercise | Frequency |
| --- | --- |
| backup restore smoke test | monthly |
| provider outage/tabletop | quarterly |
| security/credential compromise tabletop | semiannual |
| database/application DR exercise | at least annual |
| crisis communications exercise | annual |
| BIA/RTO/RPO review | annual and after material change |

## Communications

Maintain approved contact/escalation lists for internal responders, hosting provider, critical vending/payment providers, identity provider, customers/merchants requiring notification, legal/compliance and relevant authorities. Do not include secret values in continuity documents.

## Post-exercise/post-incident improvement

Every material exercise or invocation records objectives, actual performance versus RTO/RPO, gaps, decisions, lessons, corrective actions, owners and due dates. Effectiveness is verified before closure.