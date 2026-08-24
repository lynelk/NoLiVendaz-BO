# Operations Worker

Continuously evaluates provider connector health, credential expiry and critical reconciliation exposure. It persists health history, updates operational connector state, creates/auto-resolves deduplicated alerts, and optionally delivers new critical alerts to `ALERT_WEBHOOK_URL`.

It never initiates vending, refunds or settlement mutations. Run it as a separate singleton or horizontally-safe scheduled service. `OPERATIONS_WORKER_INTERVAL_MS` defaults to 120000 and is clamped to at least 60000 ms.
