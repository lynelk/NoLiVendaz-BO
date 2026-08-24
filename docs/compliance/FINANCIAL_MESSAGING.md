# Financial Messaging and Identifier Governance

Covers ISO 20022, ISO 8583:2023 and ISO 9362:2022 where those standards are directly applicable to an integration boundary.

## Architectural rule

NOLI's canonical transaction model remains provider-neutral. Standards-specific message syntax belongs in dedicated adapters/profile libraries. Core services consume normalized business semantics plus preserved evidence of the original external message.

```text
External network/provider message
        |
Approved profile/version validator
        |
Adapter mapping + semantic validation
        |
Canonical NOLI transaction/event
        |
Audit/reconciliation evidence
```

Never scatter ISO 20022 XML paths, ISO 8583 field numbers or BIC assumptions through transaction-domain code.

## Applicability

### ISO 20022

Applicable when NOLI directly generates, validates, transforms, sends or receives ISO 20022 messages. Implementations must use official Registration Authority message definitions and an explicitly approved community/market-practice profile where relevant.

If CPay or another financial provider owns the ISO 20022 boundary, NOLI records the provider contract/profile/version and validates the canonical interface with that provider rather than falsely asserting that NOLI itself is the ISO 20022 endpoint.

### ISO 8583:2023

Applicable when NOLI directly interfaces with an acquiring/issuing/card-transaction endpoint using ISO 8583. The interface must have an approved message profile defining the maintenance-agency/version basis plus network-specific field usage and transport/security rules.

Do not infer an ISO 8583 profile from a few familiar data elements. Networks frequently use implementation-specific profiles.

### ISO 9362:2022

Applicable when Business Identifier Codes are used to identify parties, address messages or route financial transactions. Syntax validation alone does not prove a BIC is assigned, active or appropriate. Production routing requires registry/authoritative-counterparty validation and evidence.

## Approved message profile record

Every financial-message integration profile contains:

- profile ID and owner;
- standard (`ISO20022` or `ISO8583`);
- standard/message-definition version;
- business service/network/community;
- message definition or MTI/profile scope;
- allowed sender/receiver roles;
- transport and security protocol;
- schema/field validation artefact/version;
- mandatory/conditional business rules;
- identifier rules including BIC use;
- amount/currency/date/time rules;
- duplicate/idempotency rules;
- correlation/reconciliation identifiers;
- error/reject/reversal/return mapping;
- test/certification evidence;
- effective date and retirement date;
- backwards-compatibility/migration plan;
- approving authority.

Production messages must be rejected or quarantined if the profile is unknown, inactive or outside the supported version window.

## Canonical financial message evidence

For every directly handled financial message, retain metadata sufficient to prove what was received/sent without unnecessarily retaining sensitive raw content:

- NOLI correlation ID;
- transaction/payment/refund/settlement reference;
- standard and approved profile ID;
- message definition/version;
- direction (`INBOUND`/`OUTBOUND`);
- sender and receiver identifiers;
- BICs when applicable;
- event timestamp and receive/send timestamp;
- validation result and validation errors;
- cryptographic/content digest of raw message;
- sanitized/raw storage pointer when retention is justified;
- external/network reference;
- mapping version;
- processing result;
- duplicate/replay indicator.

Raw PAN, authentication data, secrets or unnecessary personal data must not be copied into ordinary audit logs.

## ISO 20022 implementation controls

1. Use official message definitions from the ISO 20022 Registration Authority catalogue.
2. Pin the approved message-definition/profile version rather than silently accepting any schema version.
3. Validate syntax/schema before semantic processing.
4. Apply community/market-practice rules separately from base-schema validation.
5. Map identifiers, agents, accounts, amounts, currencies, dates and statuses explicitly into canonical fields.
6. Preserve original external references and correlation.
7. Maintain clear mappings for reject, return, reversal and status-report semantics.
8. Test positive, negative, boundary, duplicate and version-mismatch cases.
9. Treat annual/new message-version migration as a controlled change with certification evidence.
10. Do not generate proprietary extensions that misrepresent themselves as standard fields.

## ISO 8583 implementation controls

1. Record the exact ISO 8583:2023/network implementation profile used.
2. Validate message type/profile before processing.
3. Validate bitmap/field presence, format and length using the approved profile.
4. Normalize amounts/currencies using explicit semantics; never assume decimal placement without the profile.
5. Preserve system trace/network references needed for reconciliation.
6. Enforce duplicate detection/idempotency for financial requests.
7. Define request/response, advice, reversal and timeout handling explicitly for the network profile.
8. On ambiguous timeout, query/reconcile according to the network contract; never blindly replay money movement.
9. Keep transport/security controls (for example network MAC/key arrangements) in a dedicated secure integration boundary and approved key-management system.
10. Retain certification/test evidence for each profile/version.

## BIC controls

A BIC implementation has two validation layers:

- **syntactic validation**: expected 8- or 11-character structure and character classes;
- **authoritative validation**: confirm the identifier against the approved BIC directory/registry or trusted counterparty data source and validate the entity/use context.

Only authoritative validation can support production routing. Store the directory/source version and validation timestamp where BIC routing is material.

## Version lifecycle

`DRAFT -> TESTING -> CERTIFIED -> ACTIVE -> DEPRECATED -> RETIRED`

Only `ACTIVE` profiles may process new production traffic. Emergency reactivation of a deprecated profile requires documented risk acceptance and expiry.

## Reconciliation

Financial-message ingestion does not replace NOLI's independent reconciliation. Reconcile canonical payment/vend/refund/settlement state against provider/network references. Preserve original message identifiers so every external outcome can be traced back to the canonical transaction.

## Testing

Mandatory test classes for each active profile:

- schema/format compliance;
- mandatory and conditional business rules;
- unsupported version/profile;
- malformed identifiers/BIC;
- amount/currency precision;
- duplicate/replay;
- timeout/unknown outcome;
- reject/error mapping;
- reversal/return/refund mapping where applicable;
- reconciliation reference preservation;
- sensitive-data logging checks;
- backwards-compatibility and migration.

## Change governance

Changes to message versions, mapping rules, field semantics, identifier validation or financial status mapping are high-risk normal changes. They require peer review, certification tests, reconciliation impact assessment, rollback/parallel-run plan and change-authority approval before production.