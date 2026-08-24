export function money(value: string | number | null | undefined, currency = "UGX") {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return `${currency} 0`;
  try {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "UGX" ? 0 : 2
    }).format(numeric);
  } catch {
    return `${currency} ${numeric.toLocaleString("en-UG")}`;
  }
}

export function dateTime(value: unknown) {
  if (typeof value !== "string" && !(value instanceof Date)) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-UG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Kampala"
  }).format(date);
}

export function text(value: unknown, fallback = "—") {
  return typeof value === "string" && value.trim() ? value : fallback;
}
