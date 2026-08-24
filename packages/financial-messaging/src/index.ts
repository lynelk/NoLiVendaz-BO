export type FinancialMessageStandard = "ISO20022" | "ISO8583";
export type MessageDirection = "INBOUND" | "OUTBOUND";
export type MessageValidationStatus = "VALID" | "INVALID" | "QUARANTINED";
export type ProfileLifecycleState = "DRAFT" | "TESTING" | "CERTIFIED" | "ACTIVE" | "DEPRECATED" | "RETIRED";

export interface FinancialMessageProfile {
  id: string;
  standard: FinancialMessageStandard;
  standardVersion: string;
  businessService: string;
  messageDefinition: string;
  state: ProfileLifecycleState;
  effectiveFrom: string;
  effectiveTo?: string;
  mappingVersion: string;
}

export interface FinancialMessageEnvelope {
  correlationId: string;
  transactionReference?: string;
  standard: FinancialMessageStandard;
  profileId: string;
  standardVersion: string;
  messageDefinition: string;
  direction: MessageDirection;
  senderIdentifier?: string;
  receiverIdentifier?: string;
  senderBic?: string;
  receiverBic?: string;
  eventTimestamp: string;
  observedTimestamp: string;
  validationStatus: MessageValidationStatus;
  validationErrors: readonly string[];
  contentDigest: string;
  externalReference?: string;
  mappingVersion: string;
}

export interface BicSyntaxResult {
  valid: boolean;
  normalized: string;
  length: 0 | 8 | 11;
  reason?: string;
}

const BIC_PATTERN = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function normalizeBic(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Performs structure-level BIC validation only.
 *
 * A syntactically valid BIC is not proof that the identifier is assigned,
 * active, belongs to the expected organization, or is suitable for routing.
 * Production routing must also validate against an approved authoritative
 * BIC directory/counterparty source and retain evidence of that validation.
 */
export function validateBicSyntax(value: string): BicSyntaxResult {
  const normalized = normalizeBic(value);
  const length = normalized.length === 8 ? 8 : normalized.length === 11 ? 11 : 0;
  if (length === 0) {
    return { valid: false, normalized, length, reason: "BIC must contain 8 or 11 characters" };
  }
  if (!BIC_PATTERN.test(normalized)) {
    return { valid: false, normalized, length, reason: "BIC structure is invalid" };
  }
  return { valid: true, normalized, length };
}

export function isProfileActive(profile: FinancialMessageProfile, at: Date = new Date()): boolean {
  if (profile.state !== "ACTIVE") return false;
  const now = at.getTime();
  const from = Date.parse(profile.effectiveFrom);
  if (!Number.isFinite(from) || now < from) return false;
  if (profile.effectiveTo) {
    const to = Date.parse(profile.effectiveTo);
    if (!Number.isFinite(to) || now >= to) return false;
  }
  return true;
}

export function validateEnvelopeMetadata(envelope: FinancialMessageEnvelope): string[] {
  const errors: string[] = [];
  if (!envelope.correlationId.trim()) errors.push("correlationId is required");
  if (!envelope.profileId.trim()) errors.push("profileId is required");
  if (!envelope.standardVersion.trim()) errors.push("standardVersion is required");
  if (!envelope.messageDefinition.trim()) errors.push("messageDefinition is required");
  if (!envelope.mappingVersion.trim()) errors.push("mappingVersion is required");
  if (!Number.isFinite(Date.parse(envelope.eventTimestamp))) errors.push("eventTimestamp must be an ISO-compatible timestamp");
  if (!Number.isFinite(Date.parse(envelope.observedTimestamp))) errors.push("observedTimestamp must be an ISO-compatible timestamp");
  if (!SHA256_PATTERN.test(envelope.contentDigest)) errors.push("contentDigest must use sha256:<64 lowercase hex characters>");

  for (const [label, bic] of [["senderBic", envelope.senderBic], ["receiverBic", envelope.receiverBic]] as const) {
    if (bic !== undefined && !validateBicSyntax(bic).valid) errors.push(`${label} has invalid BIC syntax`);
  }

  return errors;
}

export function assertEnvelopeMetadata(envelope: FinancialMessageEnvelope): void {
  const errors = validateEnvelopeMetadata(envelope);
  if (errors.length > 0) throw new Error(`FINANCIAL_MESSAGE_METADATA_INVALID:${errors.join(";")}`);
}
