import { CPayAdapter } from "@nolivendaz/adapter-cpay";
import { GenericHttpVendingAdapter } from "@nolivendaz/adapter-http-generic";
import { NativeVendingAdapter } from "@nolivendaz/adapter-native-vending";
import type {
  ConnectorRecord,
  ProviderType,
  TransactionStatus,
  VendStatus
} from "@nolivendaz/canonical-models";
import {
  type ProviderSettlement,
  type RefundRequest,
  type RefundResponse,
  type SecretResolver,
  type VendRequest,
  type VendResponse,
  type VendingProviderAdapter,
  getByPath,
  interpolatePath,
  normalizeRefundStatus,
  parseRuntimeConfiguration,
  requireEndpoint,
  requestJson
} from "@nolivendaz/provider-sdk";

export interface UnknownTransactionRecord {
  id: string;
  providerType: ProviderType;
  connector: ConnectorRecord;
  providerTransactionId: string | null;
  status: TransactionStatus;
}

export interface UnknownResolution {
  status: TransactionStatus;
  vendStatus: VendStatus;
  providerStatus?: string;
  providerTransactionId: string;
  queriedAt: string;
}

export type AdapterFactory = (
  connector: ConnectorRecord,
  secrets: SecretResolver
) => VendingProviderAdapter;

const genericFactory: AdapterFactory = (connector, secrets) =>
  new GenericHttpVendingAdapter(connector, secrets);

const factories = new Map<ProviderType, AdapterFactory>([
  ["NATIVE", (connector, secrets) => new NativeVendingAdapter(connector, secrets)],
  ["CPAY", (connector, secrets) => new CPayAdapter(connector, secrets)],
  ["DIRECT_API", genericFactory],
  ["UTILITY", genericFactory],
  ["AIRTIME", genericFactory],
  ["VENDING_MACHINE", genericFactory],
  ["AGGREGATOR", genericFactory],
  ["CUSTOM", genericFactory]
]);

export function registerProviderAdapterFactory(
  providerType: ProviderType,
  factory: AdapterFactory
): void {
  factories.set(providerType, factory);
}

function assertConnectorOperational(connector: ConnectorRecord): void {
  if (!connector.enabled) throw new Error("CONNECTOR_DISABLED");
  if (connector.status !== "ACTIVE" && connector.status !== "DEGRADED") {
    throw new Error(`CONNECTOR_NOT_OPERATIONAL:${connector.status}`);
  }
}

export function createProviderAdapter(
  providerType: ProviderType,
  connector: ConnectorRecord,
  secrets: SecretResolver
): VendingProviderAdapter {
  const factory = factories.get(providerType);
  if (!factory) throw new Error(`PROVIDER_ADAPTER_NOT_REGISTERED:${providerType}`);
  assertConnectorOperational(connector);
  return factory(connector, secrets);
}

export type VendExecutionResult =
  | { outcome: "CONFIRMED"; response: VendResponse }
  | { outcome: "FAILED"; error: string; httpStatus?: number }
  | { outcome: "UNKNOWN"; error: string; httpStatus?: number };

export type RefundExecutionResult =
  | { outcome: "CONFIRMED"; response: RefundResponse }
  | { outcome: "FAILED"; error: string; httpStatus?: number }
  | { outcome: "UNKNOWN"; error: string; httpStatus?: number };

function classify(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN_PROVIDER_ERROR";
  const status = typeof error === "object" && error !== null && "httpStatus" in error
    ? Number((error as { httpStatus?: unknown }).httpStatus)
    : undefined;

  if (status && status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status)) {
    return { outcome: "FAILED" as const, error: message, httpStatus: status };
  }
  return {
    outcome: "UNKNOWN" as const,
    error: message,
    ...(status ? { httpStatus: status } : {})
  };
}

function ambiguousQueryFailure(error: unknown): RefundExecutionResult {
  const message = error instanceof Error ? error.message : "UNKNOWN_PROVIDER_ERROR";
  const status = typeof error === "object" && error !== null && "httpStatus" in error
    ? Number((error as { httpStatus?: unknown }).httpStatus)
    : undefined;
  return {
    outcome: "UNKNOWN",
    error: message,
    ...(status && Number.isFinite(status) ? { httpStatus: status } : {})
  };
}

function requiredText(row: unknown, path: string | undefined, label: string): string {
  const value = getByPath(row, path);
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`PROVIDER_SETTLEMENT_FIELD_REQUIRED:${label}`);
  }
  const text = String(value).trim();
  if (!text) throw new Error(`PROVIDER_SETTLEMENT_FIELD_REQUIRED:${label}`);
  return text;
}

function validMoney(value: string, label: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`PROVIDER_SETTLEMENT_INVALID_AMOUNT:${label}`);
  }
  return value;
}

export async function executeVendSafely(
  providerType: ProviderType,
  connector: ConnectorRecord,
  secrets: SecretResolver,
  request: VendRequest
): Promise<VendExecutionResult> {
  try {
    return {
      outcome: "CONFIRMED",
      response: await createProviderAdapter(providerType, connector, secrets).initiateVend(request)
    };
  } catch (error) {
    return classify(error);
  }
}

export async function executeRefundSafely(
  _providerType: ProviderType,
  connector: ConnectorRecord,
  secrets: SecretResolver,
  request: RefundRequest
): Promise<RefundExecutionResult> {
  try {
    assertConnectorOperational(connector);
    const runtime = parseRuntimeConfiguration(connector);
    const endpoint = requireEndpoint(
      runtime,
      "initiateRefund",
      "PROVIDER_REFUND_NOT_CONFIGURED"
    );
    const response = await requestJson(
      connector,
      secrets,
      runtime,
      "POST",
      endpoint,
      request
    );
    const fields = runtime.fields ?? {};
    const providerRefundId = getByPath(response.body, fields.providerRefundId);
    const rawStatus = getByPath(response.body, fields.refundStatus ?? fields.providerStatus);
    const providerStatus = getByPath(response.body, fields.providerStatus);

    if (typeof providerRefundId !== "string" || !providerRefundId.trim()) {
      return { outcome: "UNKNOWN", error: "PROVIDER_REFUND_REFERENCE_MISSING" };
    }

    return {
      outcome: "CONFIRMED",
      response: {
        providerRefundId,
        status: normalizeRefundStatus(rawStatus, runtime.refundStatusMap),
        ...(typeof providerStatus === "string" ? { providerStatus } : {})
      }
    };
  } catch (error) {
    return classify(error);
  }
}

export async function queryRefundStatusSafely(
  connector: ConnectorRecord,
  secrets: SecretResolver,
  providerRefundId: string
): Promise<RefundExecutionResult> {
  try {
    assertConnectorOperational(connector);
    const runtime = parseRuntimeConfiguration(connector);
    const endpoint = requireEndpoint(
      runtime,
      "getRefundStatus",
      "PROVIDER_REFUND_STATUS_NOT_CONFIGURED"
    );
    const response = await requestJson(
      connector,
      secrets,
      runtime,
      "GET",
      interpolatePath(endpoint, { reference: providerRefundId })
    );
    const fields = runtime.fields ?? {};
    const returnedIdRaw = getByPath(response.body, fields.providerRefundId);
    const returnedId = typeof returnedIdRaw === "string" || typeof returnedIdRaw === "number"
      ? String(returnedIdRaw).trim()
      : "";
    if (returnedId && returnedId !== providerRefundId) {
      return { outcome: "UNKNOWN", error: "PROVIDER_REFUND_REFERENCE_MISMATCH" };
    }

    const rawStatus = getByPath(response.body, fields.refundStatus ?? fields.providerStatus);
    const providerStatus = getByPath(response.body, fields.providerStatus);
    return {
      outcome: "CONFIRMED",
      response: {
        providerRefundId,
        status: normalizeRefundStatus(rawStatus, runtime.refundStatusMap),
        ...(typeof providerStatus === "string" ? { providerStatus } : {})
      }
    };
  } catch (error) {
    return ambiguousQueryFailure(error);
  }
}

export async function fetchProviderSettlements(
  connector: ConnectorRecord,
  secrets: SecretResolver,
  from: string,
  to: string
): Promise<ProviderSettlement[]> {
  assertConnectorOperational(connector);
  const runtime = parseRuntimeConfiguration(connector);
  const settlementEndpoint = requireEndpoint(
    runtime,
    "settlements",
    "PROVIDER_SETTLEMENTS_NOT_CONFIGURED"
  );

  const endpoint = interpolatePath(settlementEndpoint, { from, to });
  const response = await requestJson(connector, secrets, runtime, "GET", endpoint);
  const fields = runtime.fields ?? {};
  const candidate = fields.settlementsArray
    ? getByPath(response.body, fields.settlementsArray)
    : response.body;
  if (!Array.isArray(candidate)) throw new Error("PROVIDER_SETTLEMENTS_ARRAY_REQUIRED");

  return candidate.map((row) => {
    const providerSettlementId = requiredText(row, fields.settlementId, "settlementId");
    const currency = requiredText(row, fields.settlementCurrency, "currency").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error("PROVIDER_SETTLEMENT_INVALID_CURRENCY");
    }
    const grossAmount = validMoney(
      requiredText(row, fields.settlementGrossAmount, "grossAmount"),
      "grossAmount"
    );
    const netRaw = getByPath(row, fields.settlementNetAmount);
    const netAmount = validMoney(
      netRaw === undefined ? grossAmount : String(netRaw),
      "netAmount"
    );
    const status = requiredText(row, fields.settlementStatus, "status");
    const periodStart = requiredText(row, fields.settlementPeriodStart, "periodStart");
    const periodEnd = requiredText(row, fields.settlementPeriodEnd, "periodEnd");
    const startMs = Date.parse(periodStart);
    const endMs = Date.parse(periodEnd);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      throw new Error("PROVIDER_SETTLEMENT_INVALID_PERIOD");
    }

    const referencesRaw = getByPath(row, fields.settlementTransactionReferences);
    let transactionReferences: string[] | undefined;
    if (referencesRaw !== undefined) {
      if (!Array.isArray(referencesRaw)) {
        throw new Error("PROVIDER_SETTLEMENT_TRANSACTION_REFERENCES_ARRAY_REQUIRED");
      }
      transactionReferences = [...new Set(
        referencesRaw
          .filter((value): value is string | number =>
            typeof value === "string" || typeof value === "number"
          )
          .map((value) => String(value).trim())
          .filter(Boolean)
      )];
    }

    return {
      providerSettlementId,
      currency,
      grossAmount,
      netAmount,
      status,
      periodStart,
      periodEnd,
      ...(transactionReferences && transactionReferences.length > 0
        ? { transactionReferences }
        : {})
    };
  });
}

export async function resolveUnknownTransaction(
  record: UnknownTransactionRecord,
  secrets: SecretResolver
): Promise<UnknownResolution> {
  const recoverableStatuses: TransactionStatus[] = [
    "UNKNOWN",
    "TIMED_OUT",
    "CREATED",
    "SUBMITTED",
    "ACCEPTED"
  ];
  if (!recoverableStatuses.includes(record.status)) {
    throw new Error("TRANSACTION_NOT_RECOVERABLE");
  }
  if (!record.providerTransactionId) {
    throw new Error("PROVIDER_TRANSACTION_REFERENCE_REQUIRED");
  }

  const result = await createProviderAdapter(
    record.providerType,
    record.connector,
    secrets
  ).getTransaction(record.providerTransactionId);

  return {
    status: result.transactionStatus,
    vendStatus: result.vendStatus,
    providerTransactionId: result.providerTransactionId,
    queriedAt: new Date().toISOString(),
    ...(result.providerStatus ? { providerStatus: result.providerStatus } : {})
  };
}
