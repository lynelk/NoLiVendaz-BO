# Generic HTTP Provider Adapter

This adapter supports configurable REST-style vending providers whose contracts can be represented by the shared provider runtime configuration.

It is registered for `DIRECT_API`, `UTILITY`, `AIRTIME`, `VENDING_MACHINE`, `AGGREGATOR` and `CUSTOM` providers. NOLI Native and CPay retain specialized adapters.

Required vending runtime endpoints:

- `endpoints.initiateVend`
- `endpoints.getVendStatus`

Optional runtime endpoints include health, transaction query, refunds, refund status, token resend, devices and settlements. Field maps normalize provider response fields into NOLI canonical models.

The adapter does not contain merchant-specific provider branches. Provider behavior belongs in connector configuration or a dedicated adapter when a contract cannot be represented safely by the generic runtime.

Production use requires certification before lifecycle promotion. Secrets must remain secret-manager references and must never be placed directly in runtime configuration.
