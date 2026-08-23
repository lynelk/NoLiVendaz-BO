# Back Office API

Receiving boundary for the authenticated Back Office API.

Responsibilities:

- auth/session enforcement;
- tenant and merchant scope enforcement;
- RBAC;
- provider/connector/capability configuration;
- transaction read models and actions;
- support, reconciliation, settlements, approvals and audit APIs;
- orchestration calls through canonical services.

Do not implement provider-specific HTTP clients here. Those belong in adapters.
