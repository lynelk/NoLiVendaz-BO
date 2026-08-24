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

`FORMAT_VALID` means only that the selected document passed the configured structural rules. It is never equivalent to registry verification.

## Back Office data boundary

The Back Office must never receive or store a raw identification number. Synchronization accepts only:

- customer external reference
- customer-safe contact/profile fields
- phone-verification timestamp
- identity type and country
- masked identity display value
- verification state
- provider code/reference
- authoritative verification timestamp
- consent version/timestamp
- source system (`NOLI` or `CPAY`)

A synchronized `VERIFIED` state is rejected unless an authoritative provider reference and verification timestamp are present.

## Service-access readiness

The API computes a customer-safe operational readiness state:

- `PHONE_REQUIRED` when the registered phone has not been verified
- `IDENTITY_REQUIRED` when the phone is verified but identity is not authoritatively `VERIFIED`
- `READY` when both required controls are satisfied

This is an operational view of the current NOLI protected-service policy. NOLI remains responsible for enforcing the requirement at transaction time.

## API

- `GET /api/v1/customers`
- `GET /api/v1/customers/:customerId/identity`
- `PUT /api/v1/customers/identity-sync`

The synchronization route requires `customer.identity.sync`. Read access is separated into `customer.read` and `customer.identity.read` permissions.

## Security invariants

- Tenant RLS applies to customer data.
- No raw NIN, passport, refugee, alien or licence number is stored.
- Operators cannot turn local format validation into authoritative verification.
- CPay/provider references are retained for reconciliation and review.
- Identity synchronization is append-only audited through the existing immutable audit log.
