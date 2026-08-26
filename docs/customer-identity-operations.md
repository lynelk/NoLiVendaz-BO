# Customer Identity Operations

NOLI Vendaz Back Office observes the progressive customer-verification lifecycle without becoming an identity authority itself.

## State model

Phone linkage and identity verification are optional during initial customer profile setup. Protected services such as power-bank rental enforce the missing requirements at the service boundary.

Customer identity states exposed to operators are:

- `NOT_SUBMITTED`
- `FORMAT_VALID`
- `VERIFICATION_PENDING`
- `VERIFIED`
- `VERIFICATION_FAILED`
- `REVIEW_REQUIRED`

`FORMAT_VALID` means only that the selected document passed configured structural rules. It is never equivalent to authoritative provider verification.

## Back Office data boundary

The Back Office must never receive or store a raw identification number. Synchronization accepts only customer-safe assurance data such as:

- customer external reference
- masked/customer-safe contact and profile fields
- phone-verification timestamp
- identity type and country
- strongly masked identity display value with no more than four visible characters
- verification state
- provider code/reference
- authoritative verification timestamp
- consent version/timestamp
- protected-service policy booleans/version
- source system (`NOLI` or `CPAY`)
- authoritative source-event timestamp

A synchronized `VERIFIED` state is rejected unless an authoritative provider reference and verification timestamp are present. A configured identity must retain type, country and strongly masked evidence. Accepted identity consent must include a consent version and acceptance timestamp.

## Protected-service readiness

The current `POWER_BANK_RENTAL` policy evaluates all of the following controls:

1. `PROFILE` — basic profile complete.
2. `TERMS` — current Terms and Privacy Notice accepted.
3. `PHONE_VERIFICATION` — registered phone verified.
4. `IDENTITY` — accepted identity document configured with masked evidence.
5. `IDENTITY_CONSENT` — versioned, timestamped identity-verification consent recorded.
6. `IDENTITY_VERIFICATION` — authoritative identity state is `VERIFIED`.

The API exposes both the summary service-access state and `protected_service_missing` codes. `FORMAT_VALID`, a saved document, or an operator action cannot make a customer service-ready.

## Read APIs

- `GET /api/v1/customers`
- `GET /api/v1/customers/:customerId/identity`
- `GET /api/v1/customer-identity/service-access-policy`
- `GET /api/v1/customer-identity/capabilities`

Customer detail queries are tenant-qualified even for platform administrators. Capability reads expose provider code, enabled state, sync/async support, supported identity types/countries and source metadata only. They contain no customer PII.

## Authoritative synchronization APIs

- `PUT /api/v1/customers/identity-sync`
- `PUT /api/v1/customer-identity/capabilities-sync`

Both write routes require all three controls:

1. a valid Back Office JWT/service principal;
2. the dedicated sync permission (`customer.identity.sync` or `customer.identity.capability.sync`);
3. header `X-NOLI-Identity-Sync-Secret` matching runtime secret `NOLI_IDENTITY_SYNC_SECRET`.

Human system roles, including `PLATFORM_SUPER_ADMIN`, receive read/investigation permissions only. Authoritative synchronization permissions belong exclusively to an explicitly provisioned NOLI/CPay integration principal and must not be exposed in the operator browser.

### Customer identity synchronization payload

The authoritative source must include `sourceUpdatedAt` as a UTC ISO-8601 timestamp with exactly millisecond precision in every synchronization request, for example `2026-08-24T20:01:00.123Z`. This intentionally avoids sub-millisecond ordering ambiguity between JavaScript and PostgreSQL timestamps.

Optional fields use these semantics:

- omitted / `undefined`: preserve the previously stored projection value;
- explicit `null`: clear a nullable value where the schema allows `null`;
- an older `sourceUpdatedAt`: rejected as `STALE_IDENTITY_SYNC`;
- the same timestamp with an identical payload: treated as idempotent;
- the same timestamp with different assurance data: rejected as `CONFLICTING_IDENTITY_SYNC_TIMESTAMP`.

Synchronization is serialized per tenant/customer reference before the previous projection is read. This prevents concurrent partial events from preserving stale values and overwriting fields changed by an earlier event. The same transaction-scoped serialization is applied to provider capability synchronization.

Example customer assurance payload shape:

```json
{
  "externalReference": "customer-reference",
  "phone": "+2567******1234",
  "phoneVerifiedAt": "2026-08-24T20:00:00.000Z",
  "identityType": "NIN",
  "identityCountry": "UG",
  "identityNumberMask": "**********1234",
  "identityStatus": "VERIFIED",
  "identityProvider": "GNUGRID",
  "identityProviderReference": "provider-reference",
  "identityVerifiedAt": "2026-08-24T20:01:00.000Z",
  "consentVersion": "2026-08-24-v3",
  "consentAcceptedAt": "2026-08-24T19:59:00.000Z",
  "profileSetupComplete": true,
  "termsAccepted": true,
  "identityConfigured": true,
  "identityConsentAccepted": true,
  "serviceAccessPolicyVersion": "NOLI_POWER_BANK_RENTAL_V1",
  "serviceAccessSource": "NOLI",
  "source": "NOLI",
  "sourceUpdatedAt": "2026-08-24T20:01:00.123Z"
}
```

### Provider capability synchronization

Each capability item must include millisecond-precision `sourceUpdatedAt`. Older snapshots are rejected. Equal-timestamp identical snapshots are idempotent; equal-timestamp conflicting snapshots are rejected. Capability data must never be inferred from a customer verification result.

## Operator UI

- `/customers` exposes protected-service queues, identity state, masked document evidence and exact missing gates.
- `/customers/:customerId` shows masked assurance evidence, consent status, provider/reference metadata and policy evaluation.
- `/customers/identity-capabilities` shows the active protected-service policy and synchronized CPay/provider coverage by identity type and country.

Raw identification numbers must never be pasted into support cases, incident notes, audit comments or screenshots.

## Security invariants

- Tenant RLS applies to customer and capability data.
- No raw NIN, passport, refugee, alien or licence number is stored.
- Strong mask validation prevents disguised raw identifiers from entering Back Office.
- Operators cannot turn local format validation into authoritative verification.
- `VERIFIED` requires provider evidence.
- Accepted identity consent requires versioned timestamped evidence.
- CPay/provider references are retained for reconciliation and review.
- Stale source events cannot overwrite newer assurance state.
- Equal-timestamp conflicting events are rejected instead of being resolved by arrival order.
- Concurrent partial projections are serialized before preservation logic is evaluated.
- Identity synchronization is append-only audited through the existing immutable audit log.
