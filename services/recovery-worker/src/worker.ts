import { runRecoveryEscalations } from "./escalation.js";
import { runAllTenantRecoveryCycles } from "./index.js";

function finiteInteger(name: string, fallback: number, min: number, max?: number): number {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  const integer = Math.trunc(parsed);
  return Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, integer));
}

const intervalMs = finiteInteger("RECOVERY_WORKER_INTERVAL_MS", 300_000, 60_000);
const batchSize = finiteInteger("RECOVERY_WORKER_BATCH_SIZE", 25, 1, 200);
let stopping = false;

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  while (!stopping) {
    try {
      const results = await runAllTenantRecoveryCycles(batchSize);
      for (const result of results) {
        result.casesEscalated += await runRecoveryEscalations(result.tenantId);
      }
      console.log(JSON.stringify({
        event: "recovery.cycle.completed",
        tenants: results.length,
        results,
        at: new Date().toISOString()
      }));
    } catch (error) {
      console.error(JSON.stringify({
        event: "recovery.cycle.failed",
        error: error instanceof Error ? error.message : "UNKNOWN",
        at: new Date().toISOString()
      }));
    }
    if (!stopping) await sleep(intervalMs);
  }
}

void main();
