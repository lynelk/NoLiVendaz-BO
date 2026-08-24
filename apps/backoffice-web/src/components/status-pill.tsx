export function StatusPill({ value }: { value?: string | null | undefined }) {
  const normalized = (value ?? "UNKNOWN").toUpperCase();
  const tone = ["FULFILLED","SETTLED","COMPLETED","SUCCESS","HEALTHY","ACTIVE","CERTIFIED","PRODUCTION","READY","VERIFIED"].includes(normalized)
    ? "success"
    : ["FAILED","OUTAGE","CRITICAL","SUSPENDED","CANCELLED","REVERSED","FORMAT_INVALID","VERIFICATION_FAILED"].includes(normalized)
      ? "danger"
      : ["UNKNOWN","TIMED_OUT","PENDING","DEGRADED","MAINTENANCE","INVESTIGATING","REFUND_PENDING","VERIFICATION_PENDING","REVIEW_REQUIRED","PHONE_REQUIRED","IDENTITY_REQUIRED"].includes(normalized)
        ? "warning"
        : "neutral";
  return <span className={`status status-${tone}`}>{normalized.replaceAll("_", " ")}</span>;
}
