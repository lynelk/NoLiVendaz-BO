# Provider Orchestrator

Resolves routes and executes canonical operations through provider adapters.

Responsibilities:

- route resolution;
- connector/capability validation;
- adapter loading;
- idempotency and correlation propagation;
- timeout policy;
- circuit breaking and safe retries;
- canonical response/error normalization;
- operational event publication.

Never blindly retry paid vending after an ambiguous timeout. Move to `UNKNOWN` and query/reconcile.
