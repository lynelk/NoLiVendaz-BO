INSERT INTO permissions (code, description) VALUES
  ('provider.read', 'View providers and provider configuration'),
  ('provider.create', 'Create provider records'),
  ('provider.edit', 'Edit provider configuration'),
  ('provider.disable', 'Disable provider operation'),
  ('provider.connector.create', 'Create provider connectors'),
  ('provider.connector.edit', 'Edit provider connectors'),
  ('provider.capability.manage', 'Manage connector capabilities'),
  ('transaction.read', 'View canonical vending transactions'),
  ('transaction.query_provider', 'Query provider for transaction state'),
  ('transaction.retry', 'Execute an explicitly safe transaction retry'),
  ('refund.request', 'Request a transaction refund'),
  ('refund.approve', 'Approve a transaction refund'),
  ('settlement.read', 'View settlement information'),
  ('settlement.reconcile', 'Perform settlement reconciliation'),
  ('support.case.read', 'View support cases'),
  ('support.case.manage', 'Create and manage support cases'),
  ('user.manage', 'Manage users'),
  ('role.manage', 'Manage roles and permissions'),
  ('audit.read', 'View immutable audit records')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO capabilities (code, description, category) VALUES
  ('vend.initiate', 'Initiate a vending request', 'vending'),
  ('vend.status', 'Query vending request status', 'vending'),
  ('vend.cancel', 'Cancel vending request where supported', 'vending'),
  ('token.resend', 'Resend an already-issued token', 'vending'),
  ('refund.create', 'Create a provider refund', 'finance'),
  ('refund.status', 'Query provider refund status', 'finance'),
  ('transaction.query', 'Query provider transaction details', 'transactions'),
  ('device.list', 'List provider devices', 'devices'),
  ('device.status', 'Query provider device status', 'devices'),
  ('device.telemetry', 'Read provider device telemetry', 'devices'),
  ('device.command', 'Issue approved remote device commands', 'devices'),
  ('settlement.list', 'List provider settlements', 'settlement'),
  ('settlement.detail', 'Read provider settlement detail', 'settlement'),
  ('webhook.receive', 'Receive signed provider webhooks', 'integration'),
  ('inventory.read', 'Read provider inventory', 'inventory'),
  ('inventory.adjust', 'Adjust provider inventory where supported', 'inventory')
ON CONFLICT (code) DO UPDATE
SET description = EXCLUDED.description, category = EXCLUDED.category;
