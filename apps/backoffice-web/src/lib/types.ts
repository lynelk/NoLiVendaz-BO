export interface OperatorContext {
  userId: string;
  tenantId: string;
  displayName?: string;
  email?: string;
  isPlatformAdmin: boolean;
  permissions: string[];
}

export interface OperationsQueues {
  unknown_transactions?: number;
  unknown_value?: string;
  refund_required?: number;
  refund_required_value?: string;
  reconciliation_open?: number;
  support_open?: number;
  provider_outages?: number;
  certification_failures?: number;
  [key: string]: unknown;
}

export interface TransactionSummary {
  id: string;
  reference: string;
  correlationId: string;
  merchantName?: string;
  providerName?: string;
  connectorName?: string;
  serviceName?: string;
  productName?: string;
  siteName?: string;
  currency: string;
  amount: string;
  totalAmount: string;
  status: string;
  paymentStatus: string;
  vendStatus: string;
  refundStatus?: string | null;
  settlementStatus?: string | null;
  providerTransactionId?: string | null;
  refundRequired?: boolean;
  settlementBlocked?: boolean;
  financialHoldReason?: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface Transaction360 extends TransactionSummary {
  connectorId?: string | null;
  providerId?: string | null;
  paymentReference?: string | null;
  cpayTransactionId?: string | null;
  recoveryAttempts?: number;
  nextRecoveryAt?: string | null;
  recoveryLastError?: string | null;
  routing?: Array<Record<string, unknown>>;
  refunds?: Array<Record<string, unknown>>;
  reconciliationExceptions?: Array<Record<string, unknown>>;
  supportCases?: Array<Record<string, unknown>>;
  settlementLinks?: Array<Record<string, unknown>>;
  timeline?: Array<Record<string, unknown>>;
}

export interface ProviderSummary {
  id: string;
  code: string;
  name: string;
  providerType: string;
  scope: string;
  status: string;
  country?: string | null;
  supportedCurrencies?: string[];
  supportedRegions?: string[];
  [key: string]: unknown;
}

export interface ProviderConnector {
  id: string;
  name: string;
  environment: string;
  apiVersion?: string | null;
  baseUrl: string;
  authType: string;
  timeoutMs: number;
  status: string;
  enabled: boolean;
  capabilities: string[];
  healthStatus?: string | null;
  healthCheckedAt?: string | null;
  certificationStatus?: string | null;
}

export interface ProviderOperations {
  provider: ProviderSummary;
  connectors: ProviderConnector[];
}

export interface ConnectorCapabilities {
  id: string;
  providerId: string;
  name: string;
  environment: string;
  status: string;
  enabled: boolean;
  capabilities: string[];
}

export interface SupportCase {
  id: string;
  case_number?: string;
  category: string;
  priority: string;
  status: string;
  title: string;
  description?: string | null;
  transaction_id?: string | null;
  provider_name?: string | null;
  transaction_reference?: string | null;
  opened_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}
