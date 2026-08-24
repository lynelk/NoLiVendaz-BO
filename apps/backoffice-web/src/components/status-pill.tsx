export function StatusPill({ value }: { value?: string | null }) {
  const normalized = (value ?? "UNKNOWN").toUpperCase();
  const tone = ["FULFILLED","SETTLED","COMPLETED","SUCCESS","HEALTHY","ACTIVE","CERTIFIED","PRODUCTION"].includes(normalized)
    ? "success"
    : ["FAILED","OUTAGE","CRITICAL","SUSPENDED","CANCELLED","REVERSED"].includes(normalized)
      ? "danger"
      : ["UNKNOWN","TIMED_OUT","PENDING","DEGRADED","MAINTENANCE","INVESTIGATING","REFUND_PENDING"].includes(normalized)
        ? "warning"
        : "neutral";
  return <span className={`status status-${tone}`}>{normalized.replaceAll("_", " ")}</span>;
}
