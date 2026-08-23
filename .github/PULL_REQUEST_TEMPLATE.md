## Summary

Describe the change and the operational problem it solves.

## Domain

- [ ] Back-office web
- [ ] Back-office API
- [ ] Provider orchestration
- [ ] Provider adapter
- [ ] Payments / settlement
- [ ] Reconciliation
- [ ] Support
- [ ] Security / IAM
- [ ] Infrastructure
- [ ] Documentation

## Safety checks

- [ ] No credentials or production secrets are included.
- [ ] Tenant isolation remains enforced.
- [ ] Provider-specific logic remains inside an adapter.
- [ ] External writes use idempotency where applicable.
- [ ] Timeout behavior does not blindly repeat paid vending.
- [ ] Webhook changes verify authenticity and prevent replay.
- [ ] Sensitive actions are audited.
- [ ] Tests or validation cover the change.

## Deployment / migration notes

Describe migrations, environment variables, provider coordination, feature flags, or rollback requirements.
