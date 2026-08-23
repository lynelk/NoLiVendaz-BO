# Phase 2 Provider Runtime and Transaction Operations

Phase 2 turns the Phase 1 control-plane model into an operational multi-provider runtime.

## Implemented

- Executable `CPayAdapter` and `NativeVendingAdapter` packages.
- Connector-configurable endpoint, response-field, auth, status and webhook mappings. No unverified provider endpoint is hardcoded.
- Secret references resolved at runtime through the provider SDK. The built-in resolver accepts `env://VARIABLE_NAME`; production may replace it with a vault-backed resolver.
- HMAC webhook verification using the exact raw request body, constant-time signature comparison, timestamp age checking and configurable signature headers/prefixes.
- Webhook payload hash and provider event ID deduplication.
- Canonical provider-event normalization and transaction timeline ingestion.
- Separate canonical payment, vending, refund and settlement sub-status columns.
- Transaction 360 list/detail/timeline APIs.
- Safe provider query for `UNKNOWN`/`TIMED_OUT` transactions. This path **never calls initiateVend**.
- Provider/connector health checks and persisted health history.

## Connector runtime configuration

`provider_connectors.runtime_configuration` contains non-secret transport mappings. Example:

```json
{
  "endpoints": {
    "health": "/health",
    "initiateVend": "/configured/provider/vends",
    "getVendStatus": "/configured/provider/vends/{reference}",
    "getTransaction": "/configured/provider/transactions/{reference}"
  },
  "fields": {
    "providerTransactionId": "data.id",
    "vendStatus": "data.status",
    "providerStatus": "data.status",
    "eventId": "event.id",
    "eventType": "event.type",
    "occurredAt": "event.occurredAt",
    "correlationId": "data.correlationId",
    "eventProviderTransactionId": "data.id"
  },
  "statusMap": {
    "SUCCESS": "FULFILLED",
    "PROCESSING": "ACCEPTED",
    "ERROR": "FAILED"
  },
  "eventStatusMap": {
    "vend.completed": "FULFILLED",
    "vend.failed": "FAILED"
  },
  "auth": {
    "headerName": "authorization",
    "prefix": "Bearer "
  },
  "webhook": {
    "signatureHeader": "x-signature",
    "timestampHeader": "x-timestamp",
    "algorithm": "sha256",
    "signaturePrefix": "",
    "maxAgeSeconds": 300,
    "includeTimestampInSignature": true
  }
}
```

The actual CPay/ChargeNow and Native Vending endpoint paths must be configured from their deployed API contracts. This deliberately avoids inventing provider URLs from documentation that does not publish them.

## APIs

```text
GET  /api/v1/transactions
GET  /api/v1/transactions/:transactionId
GET  /api/v1/transactions/:transactionId/timeline
POST /api/v1/transactions/:transactionId/query-provider
GET  /api/v1/providers/:providerId/health
POST /api/v1/connectors/:connectorId/health-check
POST /api/v1/webhooks/tenants/:tenantId/providers/:providerCode/connectors/:connectorId
```

## Critical safety invariant

A timeout does not mean a vend failed. The control plane records uncertain outcomes as `UNKNOWN` and resolves them by querying the **same original provider and connector**. Automated post-payment failover or blind re-vending is prohibited.

## Next work

- provider-specific production endpoint mapping once deployed Native Vending and CPay API contracts are confirmed;
- authenticated vend initiation orchestration and routing policy execution;
- refund and settlement operational workflows;
- support-case actions from Transaction 360;
- scheduled unknown-resolution and provider-health workers;
- adapter contract tests and provider certification suite.
