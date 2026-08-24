# Integrated Quality, Security, Service and Continuity Policy

## Policy statement

NOLI Vendaz shall design, operate and continually improve its vending control plane so that services are dependable, secure, traceable, recoverable, understandable to users and aligned with contractual, legal, regulatory and approved interoperability requirements.

Management commits to:

- understand customer, merchant, provider, regulator and other interested-party requirements;
- maintain measurable quality and service objectives;
- protect confidentiality, integrity, availability and authenticity of information;
- apply risk-based controls proportionate to business and information risk;
- separate payment, fulfilment, refund, reversal and settlement state so financial ambiguity is never hidden behind a generic success/failure status;
- prevent blind re-vending or duplicate financial execution after ambiguous provider outcomes;
- maintain maker/checker controls for high-risk financial and configuration actions;
- preserve tenant isolation and least privilege;
- maintain secure development, vulnerability management and controlled release processes;
- prepare for, respond to and recover from disruptive incidents within approved recovery objectives;
- manage suppliers and providers using due diligence, contractual requirements, service monitoring and periodic review;
- use approved financial-message definitions/profiles and validated organization identifiers where relevant;
- maintain reliable records sufficient to reconstruct material operational, financial and security decisions;
- investigate nonconformities and incidents, remove root causes where practicable and verify corrective-action effectiveness;
- provide appropriate competence, awareness, resources and communication;
- evaluate performance through KPIs, internal audit, control testing, customer feedback, service review, continuity exercises and management review;
- continually improve the integrated management system.

## Scope

The initial management-system scope covers:

- NOLI Vendaz Back Office web application and API;
- provider orchestration and approved adapters;
- recovery and operations workers;
- PostgreSQL operational/financial persistence and Redis supporting services;
- production hosting, backups, observability and deployment pipelines;
- operator authentication, authorization and privileged administration;
- transaction, vending, payment, refund, reconciliation, settlement, support, alert and incident processes;
- provider onboarding, certification, routing and credential-reference governance;
- development, testing, release and change processes;
- suppliers whose services can affect security, availability, financial correctness or continuity.

External providers remain accountable for their native systems of record. NOLI remains accountable for interface controls, mapping accuracy, routing decisions, reconciliation, evidence and contracted supplier oversight.

## Roles

- **Executive management**: approves scope, policy, risk appetite, continuity objectives, major risk acceptance and management-review actions.
- **Management-system owner**: coordinates QMS/ISMS/SMS/BCMS activities and evidence.
- **Information security owner**: security risk, incident response, access control, vulnerability and supplier-security oversight.
- **Service owner**: service catalogue, SLA/SLO performance, availability, capacity and service improvement.
- **Business continuity owner**: BIA, continuity plans, exercises and recovery evidence.
- **Product/engineering owner**: requirements, architecture, secure SDLC, quality, testing and technical debt.
- **Change authority**: risk-based approval for production changes; emergency changes require retrospective review.
- **Control owners**: operate assigned controls and retain evidence.
- **Internal auditor**: evaluates conformity and effectiveness independently of the activities being audited where practical.

## Risk acceptance

Material risks may not be silently accepted in tickets, chat messages or code comments. Acceptance must identify the risk, owner, rationale, expiry/review date, compensating controls and approving authority. High or critical security, financial-integrity or continuity risks require executive approval.

## Policy review

Review at least annually and after material changes to business scope, regulatory obligations, architecture, major incidents, audit findings or relevant standards. Controlled changes must record approver, effective date and reason.