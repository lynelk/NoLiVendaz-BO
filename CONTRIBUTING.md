# Contributing

## Branches

Use short-lived branches from `main`.

Recommended naming:

```text
feat/<scope>-<description>
fix/<scope>-<description>
chore/<description>
docs/<description>
```

## Architecture rule

Core services understand canonical vending concepts. Adapters understand providers.

Do not add provider checks such as `if provider === 'CPay'` to shared transaction or reconciliation logic. Add or extend an adapter capability instead.

## Pull requests

Every PR should explain:

- the problem;
- affected domain;
- provider impact;
- migration/configuration impact;
- security considerations;
- tests/verification;
- rollback path for operationally sensitive changes.

Financial, routing, authentication, webhook, and reconciliation changes require additional review.
