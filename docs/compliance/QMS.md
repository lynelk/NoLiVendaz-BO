# Quality Management System (ISO 9001)

## Quality objectives

NOLI Vendaz shall maintain measurable objectives reviewed at least quarterly. Initial objectives are:

| Objective | Target | Evidence |
| --- | --- | --- |
| Transaction correctness | No unresolved duplicate money movement caused by NOLI; 100% ambiguous paid vends enter controlled UNKNOWN/reconciliation flow | incident and reconciliation records |
| Release quality | 100% production releases pass required CI/security gates or have an approved time-bound exception | CI runs, change record |
| Provider integration quality | 100% production connectors certified against approved capability/profile tests before routing | certification evidence |
| Customer/service quality | >= 95% priority support cases within defined SLA; complaint trends reviewed monthly | support reports |
| Reconciliation quality | 100% critical financial exceptions assigned an owner within the response target | exception queue |
| Corrective action | >= 90% corrective actions closed by due date; effectiveness verified for major findings | CAPA register |
| Restore assurance | successful restore smoke test at least monthly | restore evidence |

Targets may be changed only through management review with rationale.

## Process approach

Core processes and owners must be recorded in the process catalogue. Every process defines inputs, outputs, responsibilities, risks, controls, resources, records and measures.

Primary value-stream processes:

1. requirements and product management;
2. provider onboarding and certification;
3. merchant/service configuration;
4. transaction orchestration and exception handling;
5. payments/refunds/settlements/reconciliation oversight;
6. customer and merchant support;
7. incident/problem management;
8. software development, testing, release and change;
9. service operation and monitoring;
10. supplier management;
11. continuity and disaster recovery;
12. management review and continual improvement.

## Requirements control

Before implementing a material product or integration change, record:

- customer/business requirement and acceptance criteria;
- regulatory/contractual requirements;
- affected services, data, roles and providers;
- security, privacy, continuity and financial-integrity impact;
- backwards compatibility and migration needs;
- verification/validation method;
- operational documentation/training changes.

Unclear requirements are defects waiting for better timing. They must be resolved before a production commitment is made.

## Design and development controls

Design changes require architecture impact assessment for material changes, peer review, traceable tests and controlled release. Critical transaction invariants are mandatory acceptance criteria:

- payment success is not equivalent to fulfilment success;
- ambiguous paid vending cannot be blindly retried;
- post-dispatch provider failover is prohibited unless a proven recovery contract explicitly allows it;
- refund and reversal operations are idempotent;
- financial state transitions remain auditable;
- provider-specific logic remains behind adapters;
- tenant isolation is preserved.

## Supplier quality

Providers and critical technology suppliers are evaluated before approval and periodically thereafter using:

- service capability and contractual fit;
- security and privacy posture;
- continuity/resilience;
- financial and operational performance;
- incident history;
- data location/subprocessor risks where relevant;
- interface/version support;
- support and escalation arrangements;
- exit/transition feasibility.

Supplier nonconformities are tracked to resolution and can trigger routing suspension.

## Nonconformity and CAPA

A nonconformity is any failure to satisfy a requirement, control, SLA, approved process or expected financial/service outcome.

For material nonconformities:

1. contain and correct the immediate issue;
2. preserve evidence;
3. assess affected transactions/customers/services;
4. determine root cause using an appropriate method;
5. identify corrective action and owner;
6. set due date and residual risk;
7. verify effectiveness after implementation;
8. update risks, tests, process documentation or training where needed;
9. close only when evidence demonstrates the action worked.

Repeated incidents with the same underlying cause must be linked to a problem record rather than treated as unrelated support noise.

## Customer feedback

Capture complaints, disputes, support trends, provider complaints and service-review feedback. Monthly review should identify recurring themes, response performance, preventable defects and product/process improvements.

## Measurement and management review

Quarterly management review covers quality objectives, customer feedback, process performance, incidents, nonconformities, supplier performance, audit results, resource needs, risks/opportunities, continuity outcomes and improvement actions.

## ISO 9001 transition watch

ISO 9001:2015 remains the current published requirements edition at this baseline. The standards owner must monitor publication of the 2026 edition, perform a formal delta assessment within 90 days of publication and maintain a transition plan within the certification body's permitted transition period.