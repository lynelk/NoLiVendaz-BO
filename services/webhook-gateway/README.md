# Webhook Gateway

Dedicated inbound boundary for provider callbacks.

Processing order:

1. identify provider/connector;
2. validate signature and timestamp;
3. prevent replay;
4. persist raw payload securely;
5. deduplicate;
6. normalize through provider adapter;
7. publish internal event;
8. acknowledge according to provider contract.

Provider callbacks must never write core domain tables directly.
