# NOLI Vendaz Integrated Management System

## Purpose

This directory defines the governance and evidence baseline for operating NOLI Vendaz as a controlled, auditable and continually improving vending and financial-operations platform.

It integrates quality management, information security, IT service management, cyber resilience, business continuity, financial-message interoperability and sustainable-finance governance without claiming certification that has not been independently assessed.

## Standards baseline

The control framework uses the following distinct standards from the requested list:

| Standard | Application |
| --- | --- |
| ISO 9001:2015 + Amd 1:2024 | Quality management system. Transition monitoring is required for the forthcoming 2026 edition. |
| ISO/IEC 27001:2022 | Information security management system requirements and Annex A control selection. |
| ISO/IEC 27000:2026 | ISMS concepts, principles and relationships. |
| ISO/IEC 20000-1:2018 + Amd 1:2024 | Service management system requirements. |
| ISO/IEC 27032:2023 | Internet-security and cybersecurity guidance. |
| ISO 22301:2019 + Amd 1:2024 | Business continuity management system requirements. |
| ISO 20022 family / Registration Authority message definitions | Financial-services message modelling and approved message definitions where NOLI directly exchanges ISO 20022 messages. |
| ISO 8583:2023 | Card-originated financial-message interchange where NOLI directly acts at that interface. |
| ISO 9362:2022 | Business Identifier Code structure and controlled use of BICs. |
| ISO 32212:2026 | Sustainable-finance transition planning where the operating legal entity is a financial institution or elects to apply the standard to relevant financial activities. |

The duplicate references to ISO/IEC 27001, ISO 8583 and ISO 32212 in the original requirement are treated once.

## Applicability rule

Management-system standards apply to the organization and operating processes, not merely source code. ISO 20022, ISO 8583 and ISO 9362 apply only to interfaces where the platform directly creates, validates, transforms, routes or consumes those financial messages or identifiers. When CPay or another regulated provider owns that boundary, the NOLI control is supplier assurance, contractual requirements, evidence, reconciliation and interface validation rather than pretending to be the upstream network itself.

ISO 32212 is conditionally applicable because it is written for financial institutions and financial activities. NOLI must record an applicability decision approved by management and revisit it when business scope changes.

## Integrated management system structure

The management system follows one common governance cycle:

1. **Context and obligations**: interested parties, legal/regulatory obligations, service commitments, financial-message profiles and climate-related applicability.
2. **Leadership and accountability**: policy approval, process owners, segregation of duties and management review.
3. **Planning**: risk assessment, quality objectives, service targets, continuity objectives, change risk and improvement plans.
4. **Support**: competence, awareness, supplier management, controlled documents, asset/configuration information and communications.
5. **Operation**: secure SDLC, provider onboarding, transaction operations, incident/problem/change management, service continuity, backups, financial-message validation and customer support.
6. **Performance evaluation**: KPIs, internal audit, control testing, customer feedback, SLA reporting, security monitoring, continuity exercises and supplier reviews.
7. **Improvement**: nonconformity, corrective action, preventive improvement, lessons learned and management-approved risk treatment.

## Mandatory controlled records

The following records must exist and remain version-controlled or stored in an approved evidence repository:

- management-system scope and policy approvals;
- interested parties and compliance obligations;
- process catalogue and owners;
- asset and information classification inventory;
- risk register and risk-treatment plan;
- ISO/IEC 27001 Statement of Applicability;
- quality objectives and KPI results;
- service catalogue, SLAs/SLOs and service reviews;
- incident, problem, change, release and configuration records;
- supplier due diligence and periodic reviews;
- business impact analysis, RTO/RPO decisions and exercise evidence;
- vulnerability, patch, access-review and security-monitoring evidence;
- financial-message profile/version approvals and validation evidence;
- BIC registry-validation evidence when BICs are used for routing;
- customer complaints, feedback and corrective actions;
- internal-audit programme, findings and closure evidence;
- management-review minutes and actions;
- continuity/restore tests;
- ISO 32212 transition-plan evidence when applicable.

## Repository documents

- `ISO_CONTROL_MATRIX.md` - standards-to-control mapping and current maturity.
- `INTEGRATED_POLICY.md` - quality, security, service and continuity policy baseline.
- `QMS.md` - ISO 9001 process and quality controls.
- `ISMS.md` - ISO/IEC 27001/27000/27032 security-management controls.
- `ITSM.md` - ISO/IEC 20000-1 service-management controls.
- `BCMS.md` - ISO 22301 continuity and resilience controls.
- `FINANCIAL_MESSAGING.md` - ISO 20022/8583/9362 interoperability governance.
- `SUSTAINABLE_FINANCE.md` - ISO 32212 applicability and transition-planning framework.
- `AUDIT_AND_EVIDENCE.md` - audit, management review, CAPA and evidence retention.
- `CONTROL_REGISTER.json` - machine-checkable control inventory used by CI.

## Certification position

Repository controls create an implementation and evidence baseline. They do not themselves constitute ISO certification. Certification requires the operating organization to implement the processes, generate objective evidence, conduct internal audit and management review, close material nonconformities, define the certification scope and undergo assessment by an accredited certification body where applicable.