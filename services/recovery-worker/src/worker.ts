import { runAllTenantRecoveryCycles } from "./index.js";

const intervalMs = Math.max(
  60_000,
  Number(process.env.RECOVERY_WORKER_INTERVAL_MS ?? 300_000)
);
const batchSize = Math.max(
  1,
  Math.min(200, Number(process.env.RECOVERY_WORKER_BATCH_SIZE ?? 25))
);
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
