import type {
  ConnectorRecord,
  TransactionStatus
} from "@nolivendaz/canonical-models";
import {
  type NormalizedProviderEvent,
  type ProviderHealthResult,
  type ProviderTransaction,
  type SecretResolver,
  type VendRequest,
  type VendResponse,
  type VendingProviderAdapter,
  getByPath,
  interpolatePath,
  normalizeVendStatus,
  parseRuntimeConfiguration,
  requestJson,
  verifyHmacWebhook
} from "@nolivendaz/provider-sdk";

function transactionStatus(status: VendResponse["status"]): TransactionStatus {
  if (status === "FULFILLED") return "FULFILLED";
  if (status === "FAILED") return "FAILED";
  if (status === "UNKNOWN") return "UNKNOWN";
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "ACCEPTED") return "ACCEPTED";
  return "SUBMITTED";
}

export class GenericHttpVendingAdapter implements VendingProviderAdapter {
  readonly connector: ConnectorRecord;

  constructor(
    connector: ConnectorRecord,
    private readonly secrets: SecretResolver
  ) {
    this.connector = connector;
  }

  async getCapabilities() {
    const runtime = parseRuntimeConfiguration(this.connector);
    const capabilities = [
      { code: "vend.initiate" },
      { code: "vend.status" },
      { code: "transaction.query" }
    ];
    if (this.connector.webhookSecretReference) capabilities.push({ code: "webhook.receive" });
    if (runtime.endpoints.initiateRefund) capabilities.push({ code: "refund.create" });
    if (runtime.endpoints.getRefundStatus) capabilities.push({ code: "refund.status" });
    if (runtime.endpoints.resendToken) capabilities.push({ code: "token.resend" });
    if (runtime.endpoints.devices) capabilities.push({ code: "device.list" });
    if (runtime.endpoints.deviceStatus) capabilities.push({ code: "device.status" });
    if (runtime.endpoints.settlements) capabilities.push({ code: "settlement.list" });
    return capabilities;
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    const runtime = parseRuntimeConfiguration(this.connector);
    if (!runtime.endpoints.health) {
      return {
        status: "UNKNOWN",
        checkedAt: new Date().toISOString(),
        details: { reason: "HEALTH_ENDPOINT_NOT_CONFIGURED" }
      };
    }
    try {
      const result = await requestJson(
        this.connector,
        this.secrets,
        runtime,
        "GET",
        runtime.endpoints.health
      );
      return {
        status: "HEALTHY",
        latencyMs: result.latencyMs,
        checkedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: "OUTAGE",
        checkedAt: new Date().toISOString(),
        details: { error: error instanceof Error ? error.message : "UNKNOWN" }
      };
    }
  }

  async initiateVend(request: VendRequest): Promise<VendResponse> {
    const runtime = parseRuntimeConfiguration(this.connector);
    const result = await requestJson(
      this.connector,
      this.secrets,
      runtime,
      "POST",
      runtime.endpoints.initiateVend,
      request
    );
    return this.toVendResponse(result.body);
  }

  async getVendStatus(reference: string): Promise<VendResponse> {
    const runtime = parseRuntimeConfiguration(this.connector);
    const result = await requestJson(
      this.connector,
      this.secrets,
      runtime,
      "GET",
      interpolatePath(runtime.endpoints.getVendStatus, { reference })
    );
    return this.toVendResponse(result.body, reference);
  }

  async getTransaction(reference: string): Promise<ProviderTransaction> {
    const runtime = parseRuntimeConfiguration(this.connector);
    const endpoint = runtime.endpoints.getTransaction ?? runtime.endpoints.getVendStatus;
    const result = await requestJson(
      this.connector,
      this.secrets,
      runtime,
      "GET",
      interpolatePath(endpoint, { reference })
    );
    const vend = this.toVendResponse(result.body, reference);
    return {
      providerTransactionId: vend.providerTransactionId,
      transactionStatus: transactionStatus(vend.status),
      vendStatus: vend.status,
      ...(vend.providerStatus ? { providerStatus: vend.providerStatus } : {})
    };
  }

  async verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string
  ): Promise<boolean> {
    return verifyHmacWebhook(this.connector, this.secrets, headers, rawBody);
  }

  async normalizeWebhook(payload: unknown): Promise<NormalizedProviderEvent[]> {
    const runtime = parseRuntimeConfiguration(this.connector);
    const fields = runtime.fields ?? {};
    const objectPayload = payload && typeof payload === "object"
      ? payload as Record<string, unknown>
      : { value: payload };

    const eventTypeValue = getByPath(payload, fields.eventType);
    const eventType = typeof eventTypeValue === "string" ? eventTypeValue : "provider.event";
    const rawStatus = getByPath(payload, fields.vendStatus ?? fields.providerStatus);
    const configured = runtime.eventStatusMap?.[eventType];
    const vendStatus = configured ?? (
      typeof rawStatus === "string"
        ? normalizeVendStatus(rawStatus, runtime.statusMap)
        : undefined
    );
    const id = getByPath(payload, fields.eventId);
    const occurredAt = getByPath(payload, fields.occurredAt);
    const correlationId = getByPath(payload, fields.correlationId);
    const providerTransactionId = getByPath(
      payload,
      fields.eventProviderTransactionId ?? fields.providerTransactionId
    );
    const providerStatus = getByPath(payload, fields.providerStatus);

    return [{
      id: typeof id === "string" ? id : `generic-${Date.now()}`,
      type: eventType,
      occurredAt: typeof occurredAt === "string" ? occurredAt : new Date().toISOString(),
      ...(typeof correlationId === "string" ? { correlationId } : {}),
      ...(typeof providerTransactionId === "string" ? { providerTransactionId } : {}),
      ...(vendStatus ? { vendStatus } : {}),
      ...(typeof providerStatus === "string" ? { providerStatus } : {}),
      payload: objectPayload
    }];
  }

  private toVendResponse(body: unknown, fallbackReference?: string): VendResponse {
    const runtime = parseRuntimeConfiguration(this.connector);
    const fields = runtime.fields ?? {};
    const providerTransactionId = getByPath(body, fields.providerTransactionId);
    const rawStatus = getByPath(body, fields.vendStatus ?? fields.providerStatus);
    const providerStatus = getByPath(body, fields.providerStatus);
    const fulfilment = getByPath(body, fields.fulfilment);

    if (typeof providerTransactionId !== "string" && !fallbackReference) {
      throw new Error("PROVIDER_TRANSACTION_REFERENCE_MISSING");
    }

    return {
      providerTransactionId: typeof providerTransactionId === "string"
        ? providerTransactionId
        : fallbackReference!,
      status: normalizeVendStatus(rawStatus, runtime.statusMap),
      ...(typeof providerStatus === "string" ? { providerStatus } : {}),
      ...(fulfilment && typeof fulfilment === "object"
        ? { fulfilment: fulfilment as Record<string, unknown> }
        : {})
    };
  }
}
