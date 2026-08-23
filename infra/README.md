# Infrastructure

Receiving boundary for deployment configuration, database migrations, observability, secrets integration, queues, storage, networking, and runtime policy.

Initial runtime dependencies are PostgreSQL and Redis. Event-bus/queue technology should be selected based on production scale and hosting environment rather than smuggled into the architecture as an accidental local-development choice.

Environment progression:

```text
local -> development -> QA -> sandbox -> staging -> production
```

Provider credentials must be isolated by environment.
