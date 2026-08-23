# Security Policy

## Security baseline

The NOLI Vendaz Back Office handles payment, vending, customer, merchant, provider, device, support, and settlement information. Treat all integrations and operational controls as security-sensitive.

Required controls include:

- tenant isolation at every data-access boundary;
- RBAC and MFA for privileged users;
- maker-checker approval for high-risk financial and routing changes;
- secrets stored in an approved secrets manager, never in Git;
- encryption in transit and at rest;
- signed and replay-protected webhooks;
- idempotency and duplicate prevention for external writes;
- PII masking in logs and support screens;
- append-only audit records for privileged actions;
- dependency, source, and container security scanning in delivery pipelines;
- credential rotation and expiry monitoring.

## Reporting vulnerabilities

Do not open public GitHub issues containing exploitable security details, credentials, customer information, or production payloads. Use the organization's approved private security-reporting channel.
