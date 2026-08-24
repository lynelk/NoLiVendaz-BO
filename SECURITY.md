# Security Policy

## Scope

NOLI Vendaz Back Office handles payment, vending, customer, merchant, provider, device, support, settlement, identity and audit information. All integrations and operational controls are security-sensitive and are governed by the integrated management system in `docs/compliance/`.

## Security baseline

Required controls include:

- tenant isolation at every data-access boundary, with PostgreSQL RLS and application tenant context;
- database-authoritative RBAC, least privilege and MFA for privileged users through the production identity provider;
- maker-checker approval for high-risk financial, routing, provider-lifecycle and privileged configuration changes;
- secrets stored in an approved secrets manager, never in Git, ordinary database fields, logs or client-side code;
- encryption in transit and at rest appropriate to data classification and hosting capability;
- signed, freshness-validated and replay-protected webhooks;
- idempotency and duplicate prevention for external writes and money movement;
- no blind replay of paid vending or financial requests after ambiguous timeout;
- PII/restricted-data masking in logs, support screens and analytics exports;
- append-only or equivalently protected audit records for privileged and material financial actions;
- dependency, source and container/security scanning in delivery pipelines;
- credential rotation and expiry monitoring;
- production/non-production credential separation;
- rate limiting, secure headers/CSP, schema validation and Internet-edge protections;
- controlled financial-message profiles and identifier validation when ISO 20022/8583/9362 interfaces apply;
- tested backup, restore and continuity controls.

## Information classification

Use the classification model in `docs/compliance/ISMS.md`: Public, Internal, Confidential and Restricted. Secrets, authentication material, sensitive personal data and exploitable security findings are Restricted.

## Access reviews

- privileged access: review at least quarterly;
- all active workforce access: review at least semiannually;
- joiner/mover/leaver changes: process promptly and retain evidence;
- break-glass access: time-bound, monitored and retrospectively reviewed.

## Vulnerability management

Security CI, dependency review and CodeQL are mandatory delivery controls. Production vulnerabilities are triaged by exploitability and impact.

Target remediation unless a stricter obligation applies:

- critical exploitable: immediate triage, target <= 72 hours;
- high: target <= 14 days;
- medium: normally <= 60 days;
- low: risk-based backlog.

Exceptions require a documented risk owner, rationale, compensating controls, expiry/review date and approval appropriate to residual risk.

## Security incident response

Lifecycle:

`DETECT -> TRIAGE -> CONTAIN -> PRESERVE -> ERADICATE -> RECOVER -> COMMUNICATE -> REVIEW`

A material incident record must include severity, detection source, affected assets/tenants/providers, timeline, evidence, containment, data/financial impact, notifications, recovery, root cause, corrective actions and lessons learned.

Potential personal-data, financial, contractual or regulatory incidents are escalated promptly to the responsible compliance/legal role for notification assessment.

## Reporting vulnerabilities

Do not open public GitHub issues containing exploitable security details, credentials, customer information, private provider payloads or production configuration. Use the organization's approved private security-reporting channel.

Reports should include affected component/version, reproduction information, impact, evidence and reporter contact where available. Do not test against third-party or customer systems without authorization.

## Supplier/provider security

Critical providers and technology suppliers require proportionate security/continuity due diligence, contractual obligations, incident-notification expectations, periodic review and exit/transition arrangements. Production connectors must complete the approved certification lifecycle.

## Audit and evidence

Retain objective evidence for access reviews, security scanning, risk treatment, incidents, provider certification, privileged actions, backup/restore tests and corrective action as defined in `docs/compliance/AUDIT_AND_EVIDENCE.md`.

## Policy review

Review at least annually and after material architecture changes, major incidents, significant legal/regulatory change or relevant standards updates.