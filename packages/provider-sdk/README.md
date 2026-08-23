# Provider SDK

Shared contracts for vending-provider adapters.

The SDK should define canonical operations such as:

```ts
interface VendingProviderAdapter {
  getCapabilities(): Promise<Capability[]>;
  healthCheck(): Promise<HealthResult>;
  initiateVend(request: VendRequest): Promise<VendResponse>;
  getVendStatus(reference: string): Promise<VendStatus>;
  getTransaction(reference: string): Promise<ProviderTransaction>;
  initiateRefund?(request: RefundRequest): Promise<RefundResponse>;
  getRefundStatus?(reference: string): Promise<RefundStatus>;
  resendToken?(reference: string): Promise<ActionResult>;
  listDevices?(): Promise<Device[]>;
  getDeviceStatus?(deviceId: string): Promise<DeviceStatus>;
  listSettlements?(query: SettlementQuery): Promise<Settlement[]>;
  verifyWebhook(headers: Headers, body: string): Promise<boolean>;
  normalizeWebhook(payload: unknown): Promise<NormalizedEvent[]>;
}
```

The implementation should also provide an adapter certification harness.
