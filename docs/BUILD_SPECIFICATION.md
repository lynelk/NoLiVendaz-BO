# NOLI Vendaz Back Office Build Specification

## Objective

Build a multi-provider vending operations and orchestration control plane that manages NOLI-native vending, CPay/ChargeNow-connected services, and direct third-party vending providers from one secure back office.

## P0 application features

### 1. Command Centre
Build an exception-first dashboard showing transaction health, financial exposure, provider health, unresolved incidents, pending refunds, reconciliation exceptions, and integration failures. Prioritize severity, value at risk, customer impact, and SLA age.

### 2. Provider Registry
Manage provider identity, type, countries, currencies, support contacts, SLA tier, lifecycle status, and commercial metadata. Provider lifecycle: `DRAFT`, `DEVELOPMENT`, `SANDBOX`, `CERTIFIED`, `PRODUCTION`, `DEGRADED`, `SUSPENDED`, `MAINTENANCE`, `RETIRED`.

### 3. Connector Registry
Manage provider environment, API version, base URL, authentication type, secret references, timeout policy, retry policy, webhook secret reference, health-check configuration, and enablement. Never persist raw credentials in ordinary tables.

### 4. Capability Registry
Declare supported operations such as `vend.initiate`, `vend.status`, `vend.cancel`, `token.resend`, `refund.create`, `refund.status`, `transaction.query`, `device.list`, `device.status`, `device.telemetry`, `settlement.list`, and `webhook.receive`. UI actions must follow capabilities.

### 5. Services and Products
Maintain normalized service/product identities and map provider product codes to internal products. Initial service families should support physical vending, electricity, water, airtime, data, subscriptions, vouchers, ticketing, EV charging, and other configurable services.

### 6. Routing Engine
Route by tenant, merchant, service, product, country, region, currency, provider priority, availability, and effective dates. Prefer provider selection before payment. Post-payment failover is disabled unless explicitly proven safe.

### 7. Canonical Transaction Model
Store internal transaction reference, correlation ID, tenant, merchant, provider, connector, service, product, site, device, customer, amounts, normalized status, provider status, provider transaction ID, CPay transaction ID where applicable, payment reference, idempotency key, and timestamps.

### 8. Transaction 360
Provide one operational screen showing transaction, customer, merchant, provider, payment, vend, refund, settlement, references, timeline, support cases, reconciliation exceptions, raw events, and permitted actions. This is the primary support and operations workspace.

### 9. Webhook Gateway
Build a dedicated inbound callback boundary. Verify signatures, timestamps, and replay protection; persist raw payloads securely; deduplicate; normalize; publish events; update through internal handlers; audit failures. Do not let webhooks update core tables directly.

### 10. Provider Orchestrator
Resolve route, load connector, instantiate adapter, enforce capability, attach idempotency/correlation, invoke provider, normalize response, record events, and apply safe timeout semantics.

### 11. Native Vending Adapter
Wrap the existing NOLI vending platform without embedding its API rules in shared services. Map merchant/site/device/product IDs, status/error codes, transactions, and webhooks.

### 12. CPay Adapter
Integrate CPay/ChargeNow capabilities where available: payments, vending initiation/query, merchant mappings, device mappings, refunds, settlement, reconciliation, billing, and webhooks. Direct integrations remain permitted for providers that should not route through CPay.

### 13. Integration Health
Show connector availability, latency, success/failure/timeout rates, webhook delay/failures, last request, last callback, credential/certificate expiry, and incidents. Health states: `HEALTHY`, `DEGRADED`, `OUTAGE`, `MAINTENANCE`, `UNKNOWN`.

### 14. Support
Link support cases to customer, merchant, transaction, provider, payment, device, vend, refund, and settlement. Support actions call adapter capabilities rather than requiring staff to switch provider portals.

### 15. RBAC and Audit
Initial roles: Platform Super Admin, Operations Admin, Provider Manager, Finance Manager, Reconciliation Analyst, Support Manager, Support Agent, Merchant Admin, Merchant Operator, Technical Support, Auditor, Read Only. Sensitive actions must be permissioned and append-only audited.

## P1 features

### Reconciliation
Compare payment, vend, provider transaction, refund, and settlement. Detect paid-not-fulfilled, fulfilled-unpaid, duplicates, missing/duplicate callbacks, provider/internal missing transactions, refund mismatches, settlement variances, incorrect fees, and incorrect commissions.

### Refund workflow
Support request, approval, submission, pending, completion, failure, rejection, and cancellation. High-risk or high-value refunds require maker-checker.

### Settlement tracking
Track provider/merchant period, currency, gross value, fees, refunds, adjustments, net amount, expected/actual date, provider reference, variance, and reconciliation state.

### Provider certification
Test authentication, health, vend initiation, status lookup, success/failure mapping, timeout behavior, duplicate protection, idempotency, webhook signature, webhook replay, delayed callbacks, refunds, reconciliation, and settlement where supported.

### Devices
Where providers expose devices, normalize provider device ID, merchant, site, type, serial, state, last seen, firmware, network state, and metadata. Remote commands must be capability-controlled, privileged, and audited.

## P2 features

Add smart routing, SLA-aware routing, cost-aware routing, safe provider failover, automated unknown-status resolution, automated reconciliation, provider scoring, anomaly detection, predictive provider monitoring, merchant self-service, and advanced BI.

## Canonical errors

Normalize provider errors into classes including `AUTHENTICATION_ERROR`, `INVALID_REQUEST`, `CUSTOMER_NOT_FOUND`, `PRODUCT_NOT_FOUND`, `INSUFFICIENT_FUNDS`, `PAYMENT_FAILED`, `VEND_REJECTED`, `PROVIDER_TIMEOUT`, `PROVIDER_UNAVAILABLE`, `DUPLICATE_REQUEST`, `UNKNOWN_TRANSACTION`, `REFUND_FAILED`, `RATE_LIMITED`, and `INTERNAL_PROVIDER_ERROR`. Preserve provider error code/message separately.

## Required API groups

```text
/api/v1/providers
/api/v1/providers/{id}/connectors
/api/v1/providers/{id}/capabilities
/api/v1/providers/{id}/health
/api/v1/routes
/api/v1/services
/api/v1/products
/api/v1/transactions
/api/v1/transactions/{id}/timeline
/api/v1/transactions/{id}/query-provider
/api/v1/transactions/{id}/refund
/api/v1/payments
/api/v1/refunds
/api/v1/settlements
/api/v1/reconciliation/exceptions
/api/v1/merchants
/api/v1/sites
/api/v1/devices
/api/v1/support/cases
/api/v1/alerts
/api/v1/webhooks/providers/{provider_code}
/api/v1/admin/users
/api/v1/admin/roles
/api/v1/admin/audit
```

## Minimum data entities

Create `tenants`, `users`, `roles`, `permissions`, `user_roles`, `providers`, `provider_connectors`, `provider_capabilities`, `provider_credentials`, `services`, `products`, `provider_products`, `routes`, `merchants`, `merchant_provider_mappings`, `sites`, `site_provider_mappings`, `devices`, `device_provider_mappings`, `customers`, `transactions`, `transaction_events`, `payments`, `vend_requests`, `refunds`, `settlements`, `reconciliation_exceptions`, `support_cases`, `support_case_events`, `webhook_events`, `provider_health_events`, `alerts`, `incidents`, `approval_requests`, and `audit_logs`.

## Reliability requirements

Implement correlation IDs, idempotency, deduplication, safe retries, circuit breakers, exponential retry for safe operations, dead-letter handling, replay, provider rate-limit handling, transaction locking where needed, and observable health checks.

**Critical rule:** provider timeout does not prove vend failure. Mark `UNKNOWN`, query, and reconcile before any repeat fulfilment request.

## Non-functional requirements

- Back-office control services availability target: 99.9%+.
- Typical internal list API P95 target: <1 second.
- Typical internal transaction lookup P95 target: <2 seconds before external provider latency.
- Horizontal worker scaling for high webhook/event volume.
- Platform remains operational when an individual provider is down.
- UTC timestamps internally with localized display.
- UUID internal identifiers plus human-readable references.
- No important searchable business field stored only inside JSON.

## Delivery sequence

1. Canonical models, tenants, IAM, provider/connector/capability registries, audit.
2. Native Vending and CPay adapters, webhook gateway, transaction ingestion, Transaction 360.
3. Command Centre, provider health, support, incidents, safe operational actions.
4. Payment/refund/settlement/reconciliation controls.
5. Third-party adapter SDK, certification, sandbox and production activation workflow.
6. Smart routing and automation.

## Provider definition of done

A provider is production-ready only when authentication, connectivity, capabilities, services/products, status mapping, error mapping, vend initiation/query, callbacks, duplicate protection, timeout handling, refunds where supported, settlement where supported, monitoring, logs, certification, and approved production routing are complete.

## Back-office acceptance criteria

- Native and CPay transactions can be found from one search.
- Support can see payment, vend, refund, and settlement without using another provider portal.
- Provider outage and degradation are visible.
- Provider-native states remain available beside normalized states.
- Duplicate requests cannot create duplicate vending.
- Unknown states are resolved safely.
- Refunds and sensitive actions respect RBAC/approval.
- Reconciliation exceptions are traceable to financial value and owner.
- Every privileged configuration change is audited.
- A new provider can be added through the adapter contract without modifying core transaction logic.
- Tenant isolation is enforced.
- Cross-provider reporting uses canonical dimensions and measures.
