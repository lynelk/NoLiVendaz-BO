# Information Security Management System

Applies ISO/IEC 27001:2022 requirements, ISO/IEC 27000:2026 concepts and ISO/IEC 27032:2023 Internet-security guidance.

## Security objectives

- preserve confidentiality, integrity, availability, authenticity and accountability for operational and financial data;
- prevent unauthorized tenant or provider access;
- prevent duplicate or unauthorized money movement;
- maintain recoverable, traceable financial state;
- detect and respond to material cyber and service events;
- maintain vulnerability and patch risk within approved thresholds;
- keep privileged access time-bound, reviewed and auditable;
- protect secrets and provider credentials from source, logs and ordinary business tables.

## Risk method

Each information-security risk record contains asset/process, threat/event, vulnerability/control weakness, affected security property, likelihood, impact, inherent score, existing controls, residual score, treatment, owner, target date and acceptance authority.

Suggested 5x5 scoring:

- likelihood: Rare 1, Unlikely 2, Possible 3, Likely 4, Almost Certain 5;
- impact: Insignificant 1, Minor 2, Moderate 3, Major 4, Severe 5;
- risk score = likelihood x impact.

Default treatment thresholds:

- 1-4 Low: owner acceptance and monitoring;
- 5-9 Moderate: documented treatment or acceptance;
- 10-16 High: treatment required; executive acceptance for residual high risk;
- 17-25 Critical: production exposure prohibited unless executive-approved emergency exception with compensating controls and expiry.

## Statement of Applicability

Maintain a controlled Statement of Applicability for ISO/IEC 27001 Annex A. For every control record applicability, implementation status, implementation approach/evidence, owner and exclusion justification. An exclusion is never justified merely because the control is inconvenient.

## Information classification

Minimum classes:

- **Public**: approved public documentation and marketing content.
- **Internal**: non-public operational documentation without sensitive customer/security data.
- **Confidential**: customer, merchant, provider, contract, operational, financial and employee information.
- **Restricted**: credentials, cryptographic material, authentication secrets, sensitive personal data, raw provider payloads containing secrets, security findings and privileged audit evidence.

Restricted data must not appear in logs, tickets, analytics exports or chat systems unless the destination is explicitly approved for that classification.

## Access management

- OIDC/MFA for workforce identities where supported by the identity provider.
- Database-authoritative tenant membership and RBAC.
- Least privilege; no shared named-user accounts.
- Platform-admin and financial privileges separated from routine support access.
- Joiner/mover/leaver changes processed promptly and auditable.
- Quarterly privileged-access review; at least semiannual review of all active workforce access.
- Break-glass access must be time-bound, monitored and retrospectively reviewed.
- Service identities use scoped credentials, rotation and environment separation.

## Authentication and secrets

- secrets generated with sufficient entropy and stored in an approved secret manager;
- no production secrets in Git, container images, ordinary database columns or client-side JavaScript;
- separate secrets between production/non-production and between security domains;
- credential expiry monitored where supported;
- compromised credentials revoked/rotated immediately;
- OIDC callback and token exchange validate issuer/audience/state/PKCE and verified-email requirements as designed.

## Cryptography

- TLS for external and internal sensitive transport where supported by hosting/network architecture;
- encryption at rest for managed persistence and backup storage;
- approved algorithms/libraries only; custom cryptography prohibited;
- keys/secrets have owners, rotation criteria and destruction/revocation procedures;
- cryptographic failures are security events.

## Secure SDLC

Required controls include:

- branch/PR workflow and peer review;
- defined acceptance criteria and threat/risk impact for material changes;
- type checking, automated tests and production builds;
- dependency audit and CodeQL;
- secret prevention and review;
- infrastructure/configuration review;
- database migration review;
- provider-adapter certification;
- security gate before deployment;
- rollback/forward-fix plan;
- post-deployment verification.

Critical/high vulnerabilities may not be knowingly released without documented, time-bound risk acceptance.

## Logging and monitoring

Security and financial logs must support reconstruction without exposing secrets. Capture at minimum:

- authentication success/failure and privileged role changes;
- provider/connector lifecycle and routing changes;
- approval decisions;
- financial state transitions;
- refund/reversal actions;
- webhook verification/replay failures;
- reconciliation exceptions;
- security-sensitive configuration changes;
- critical incidents and operator actions.

Protect audit records from unauthorized modification and define retention according to legal, contractual and operational requirements.

## Internet and application security

Following ISO/IEC 27032 principles, explicitly manage web, API, network, identity, provider and stakeholder dependencies:

- secure headers and CSP;
- input/schema validation;
- rate limiting and abuse controls;
- authenticated administrative APIs;
- webhook signature/freshness/replay validation;
- egress allowlisting where practicable for high-risk integrations;
- DNS/domain/TLS ownership monitoring;
- DDoS/WAF controls at the hosting edge where available;
- dependency and supply-chain monitoring;
- incident information-sharing procedures with affected providers and customers;
- phishing/account-takeover awareness for privileged operators.

## Vulnerability management

- continuous dependency/security scanning in CI;
- monthly review of production dependencies at minimum;
- critical exploitable findings: immediate triage and target remediation within 72 hours unless an approved exception defines a shorter/alternate control;
- high findings: target remediation within 14 days;
- medium findings: risk-based target, normally 60 days;
- low findings: backlog/prioritized improvement;
- penetration testing after major architectural/security changes and at least annually for Internet-facing production scope where proportionate.

## Security incident response

Lifecycle:

`DETECT -> TRIAGE -> CONTAIN -> PRESERVE -> ERADICATE -> RECOVER -> COMMUNICATE -> REVIEW`

Incident records include severity, detection source, affected assets/tenants/providers, timeline, evidence, containment, data/financial impact, notifications, recovery, root cause, corrective actions and lessons learned.

Potential personal-data, financial or regulatory incidents must be escalated to the responsible legal/compliance role for notification assessment within applicable deadlines.

## Supplier security

Critical suppliers require security due diligence, contractual controls, incident notification expectations, access/data handling terms, continuity commitments, subprocessor visibility where relevant, periodic review and exit arrangements.

## Data lifecycle

Define purpose, legal basis/contractual need where applicable, classification, access, retention, archive and secure deletion for each material dataset. Raw webhook/provider payload retention should be minimized while preserving dispute/audit requirements.

## Control assurance

- monthly operational security review;
- quarterly privileged-access and critical-supplier review;
- quarterly vulnerability/risk treatment review;
- annual internal ISMS audit at minimum;
- annual management review at minimum, preferably integrated quarterly reviews;
- post-incident control review for material events.