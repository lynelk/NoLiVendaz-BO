import { CPayAdapter } from "@nolivendaz/adapter-cpay";
import { NativeVendingAdapter } from "@nolivendaz/adapter-native-vending";
import type {
  ConnectorRecord,
  ProviderType,
  TransactionStatus,
  VendStatus
} from "@nolivendaz/canonical-models";
import type {
  SecretResolver,
  VendingProviderAdapter
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

const factories = new Map<ProviderType, AdapterFactory>([
  ["NATIVE", (connector, secrets) => new NativeVendingAdapter(connector, secrets)],
  ["CPAY", (connector, secrets) => new CPayAdapter(connector, secrets)]
]);

export function registerProviderAdapterFactory(
  providerType: ProviderType,
  factory: AdapterFactory
): void {
  factories.set(providerType, factory);
}

export function createProviderAdapter(
  providerType: ProviderType,
  connector: ConnectorRecord,
  secrets: SecretResolver
): VendingProviderAdapter {
  const factory = factories.get(providerType);
  if (!factory) throw new Error(`PROVIDER_ADAPTER_NOT_REGISTERED:${providerType}`);
  if (!connector.enabled) throw new Error("CONNECTOR_DISABLED");
  return factory(connector, secrets);
}

export async function resolveUnknownTransaction(
  record: UnknownTransactionRecord,
  secrets: SecretResolver
): Promise<UnknownResolution> {
  if (record.status !== "UNKNOWN" && record.status !== "TIMED_OUT") {
    throw new Error("TRANSACTION_NOT_UNKNOWN");
  }
  if (!record.providerTransactionId) {
    throw new Error("PROVIDER_TRANSACTION_REFERENCE_REQUIRED");
  }

  const adapter = createProviderAdapter(record.providerType, record.connector, secrets);

  // Safety invariant: resolution queries the original provider only.
  // It must never invoke initiateVend or switch to another provider.
  const result = await adapter.getTransaction(record.providerTransactionId);

  return {
    status: result.transactionStatus,
    vendStatus: result.vendStatus,
    providerTransactionId: result.providerTransactionId,
    queriedAt: new Date().toISOString(),
    ...(result.providerStatus ? { providerStatus: result.providerStatus } : {})
  };
}
