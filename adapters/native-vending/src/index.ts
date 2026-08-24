import type { ConnectorRecord, TransactionStatus } from "@nolivendaz/canonical-models";
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
  requireEndpoint,
  requireVendingEndpoints,
  requestJson,
  verifyHmacWebhook
} from "@nolivendaz/provider-sdk";

const txStatus = (status: VendResponse["status"]): TransactionStatus =>
  status === "FULFILLED" ? "FULFILLED" :
  status === "FAILED" ? "FAILED" :
  status === "UNKNOWN" ? "UNKNOWN" :
  status === "CANCELLED" ? "CANCELLED" :
  status === "ACCEPTED" ? "ACCEPTED" : "SUBMITTED";

export class NativeVendingAdapter implements VendingProviderAdapter {
  readonly connector: ConnectorRecord;

  constructor(connector: ConnectorRecord, private readonly secrets: SecretResolver) {
    this.connector = connector;
  }

  async getCapabilities() {
    const runtime = parseRuntimeConfiguration(this.connector);
    const capabilities: Array<{ code: string }> = [];
    if (runtime.endpoints.initiateVend) capabilities.push({ code: "vend.initiate" });
    if (runtime.endpoints.getVendStatus) capabilities.push({ code: "vend.status" });
    if (runtime.endpoints.getTransaction || runtime.endpoints.getVendStatus) {
      capabilities.push({ code: "transaction.query" });
    }
    if (this.connector.webhookSecretReference) capabilities.push({ code: "webhook.receive" });
    if (runtime.endpoints.initiateRefund) capabilities.push({ code: "refund.create" });
    if (runtime.endpoints.getRefundStatus) capabilities.push({ code: "refund.status" });
    if (runtime.endpoints.settlements) capabilities.push({ code: "settlement.list" });
    return capabilities;
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    const runtime = parseRuntimeConfiguration(this.connector);
    if (!runtime.endpoints.health) {
      return { status: "UNKNOWN", checkedAt: new Date().toISOString(), details: { reason: "HEALTH_ENDPOINT_NOT_CONFIGURED" } };
    }
    try {
      const result = await requestJson(this.connector, this.secrets, runtime, "GET", runtime.endpoints.health);
      return { status: "HEALTHY", latencyMs: result.latencyMs, checkedAt: new Date().toISOString() };
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
    const { initiateVend } = requireVendingEndpoints(runtime);
    const result = await requestJson(this.connector, this.secrets, runtime, "POST", initiateVend, request);
    return this.toVend(result.body);
  }

  async getVendStatus(reference: string): Promise<VendResponse> {
    const runtime = parseRuntimeConfiguration(this.connector);
    const { getVendStatus } = requireVendingEndpoints(runtime);
    const result = await requestJson(
      this.connector,
      this.secrets,
      runtime,
      "GET",
      interpolatePath(getVendStatus, { reference })
    );
    return this.toVend(result.body, reference);
  }

  async getTransaction(reference: string): Promise<ProviderTransaction> {
    const runtime = parseRuntimeConfiguration(this.connector);
    const endpoint = runtime.endpoints.getTransaction
      ?? requireEndpoint(runtime, "getVendStatus", "CONNECTOR_TRANSACTION_QUERY_ENDPOINT_REQUIRED");
    const result = await requestJson(
      this.connector,
      this.secrets,
      runtime,
      "GET",
      interpolatePath(endpoint, { reference })
    );
    const vend = this.toVend(result.body, reference);
    return {
      providerTransactionId: vend.providerTransactionId,
      transactionStatus: txStatus(vend.status),
      vendStatus: vend.status,
      ...(vend.providerStatus ? { providerStatus: vend.providerStatus } : {})
    };
  }

  async verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string) {
    return verifyHmacWebhook(this.connector, this.secrets, headers, rawBody);
  }

  async normalizeWebhook(payload: unknown): Promise<NormalizedProviderEvent[]> {
    const runtime = parseRuntimeConfiguration(this.connector);
    const fields = runtime.fields ?? {};
    const objectPayload = payload && typeof payload === "object"
      ? payload as Record<string, unknown>
      : { value: payload };
    const id = getByPath(payload, fields.eventId);
    const type = getByPath(payload, fields.eventType);
    const occurred = getByPath(payload, fields.occurredAt);
    const correlation = getByPath(payload, fields.correlationId);
    const providerTx = getByPath(payload, fields.eventProviderTransactionId ?? fields.providerTransactionId);
    const providerStatus = getByPath(payload, fields.providerStatus);
    const rawVend = getByPath(payload, fields.vendStatus ?? fields.providerStatus);
    const eventType = typeof type === "string" ? type : "provider.event";
    const mapped = runtime.eventStatusMap?.[eventType];
    const vendStatus = mapped ?? (
      typeof rawVend === "string" ? normalizeVendStatus(rawVend, runtime.statusMap) : undefined
    );
    return [{
      id: typeof id === "string" ? id : `native-${Date.now()}`,
      type: eventType,
      occurredAt: typeof occurred === "string" ? occurred : new Date().toISOString(),
      ...(typeof correlation === "string" ? { correlationId: correlation } : {}),
      ...(typeof providerTx === "string" ? { providerTransactionId: providerTx } : {}),
      ...(vendStatus ? { vendStatus } : {}),
      ...(typeof providerStatus === "string" ? { providerStatus } : {}),
      payload: objectPayload
    }];
  }

  private toVend(body: unknown, fallback?: string): VendResponse {
    const runtime = parseRuntimeConfiguration(this.connector);
    const fields = runtime.fields ?? {};
    const providerId = getByPath(body, fields.providerTransactionId);
    const raw = getByPath(body, fields.vendStatus ?? fields.providerStatus);
    const providerStatus = getByPath(body, fields.providerStatus);
    const fulfilment = getByPath(body, fields.fulfilment);
    if (typeof providerId !== "string" && !fallback) {
      throw new Error("PROVIDER_TRANSACTION_REFERENCE_MISSING");
    }
    return {
      providerTransactionId: typeof providerId === "string" ? providerId : fallback!,
      status: normalizeVendStatus(raw, runtime.statusMap),
      ...(typeof providerStatus === "string" ? { providerStatus } : {}),
      ...(fulfilment && typeof fulfilment === "object"
        ? { fulfilment: fulfilment as Record<string, unknown> }
        : {})
    };
  }
}
