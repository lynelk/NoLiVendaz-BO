BEGIN;
SELECT set_config('app.is_platform_admin','true',true);

INSERT INTO roles(tenant_id,code,name,description,system_defined) VALUES
 (NULL,'PLATFORM_SUPER_ADMIN','Platform Super Admin','Full platform control across tenants',true),
 (NULL,'OPERATIONS_ADMIN','Operations Admin','Operations, provider health, routing, support and recovery',true),
 (NULL,'PROVIDER_MANAGER','Provider Manager','Provider, connector, capability and certification management',true),
 (NULL,'FINANCE_MANAGER','Finance Manager','Payments, refunds, settlements and financial control',true),
 (NULL,'RECONCILIATION_ANALYST','Reconciliation Analyst','Reconciliation and settlement assurance',true),
 (NULL,'SUPPORT_MANAGER','Support Manager','Support case management and transaction investigation',true),
 (NULL,'SUPPORT_AGENT','Support Agent','Support case handling and read-only transaction investigation',true),
 (NULL,'MERCHANT_ADMIN','Merchant Admin','Merchant, site and catalogue operations',true),
 (NULL,'MERCHANT_OPERATOR','Merchant Operator','Merchant transaction and device operations',true),
 (NULL,'TECHNICAL_SUPPORT','Technical Support','Integration health, alerts and provider diagnostics',true),
 (NULL,'AUDITOR','Auditor','Read-only financial, configuration and audit access',true),
 (NULL,'READ_ONLY','Read Only','General read-only operational access',true)
ON CONFLICT (tenant_id,code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,system_defined=true;

WITH role_map(role_code,permission_code) AS (
 VALUES
 ('OPERATIONS_ADMIN','transaction.read'),('OPERATIONS_ADMIN','transaction.query_provider'),('OPERATIONS_ADMIN','provider.read'),('OPERATIONS_ADMIN','provider.health.read'),('OPERATIONS_ADMIN','provider.health.check'),('OPERATIONS_ADMIN','route.read'),('OPERATIONS_ADMIN','route.manage'),('OPERATIONS_ADMIN','support.read'),('OPERATIONS_ADMIN','support.create'),('OPERATIONS_ADMIN','support.update'),('OPERATIONS_ADMIN','recovery.read'),('OPERATIONS_ADMIN','recovery.run'),('OPERATIONS_ADMIN','alert.read'),('OPERATIONS_ADMIN','alert.manage'),('OPERATIONS_ADMIN','incident.read'),('OPERATIONS_ADMIN','incident.manage'),('OPERATIONS_ADMIN','merchant.read'),('OPERATIONS_ADMIN','catalog.read'),('OPERATIONS_ADMIN','device.read'),('OPERATIONS_ADMIN','analytics.read'),
 ('PROVIDER_MANAGER','provider.read'),('PROVIDER_MANAGER','provider.create'),('PROVIDER_MANAGER','provider.edit'),('PROVIDER_MANAGER','provider.connector.create'),('PROVIDER_MANAGER','provider.connector.edit'),('PROVIDER_MANAGER','provider.capability.manage'),('PROVIDER_MANAGER','provider.lifecycle.manage'),('PROVIDER_MANAGER','provider.connector.state.manage'),('PROVIDER_MANAGER','provider.health.read'),('PROVIDER_MANAGER','provider.health.check'),('PROVIDER_MANAGER','certification.read'),('PROVIDER_MANAGER','certification.run'),('PROVIDER_MANAGER','certification.approve'),('PROVIDER_MANAGER','catalog.read'),('PROVIDER_MANAGER','alert.read'),
 ('FINANCE_MANAGER','transaction.read'),('FINANCE_MANAGER','payment.read'),('FINANCE_MANAGER','refund.read'),('FINANCE_MANAGER','refund.request'),('FINANCE_MANAGER','refund.approve'),('FINANCE_MANAGER','settlement.read'),('FINANCE_MANAGER','settlement.sync'),('FINANCE_MANAGER','reconciliation.read'),('FINANCE_MANAGER','reconciliation.run'),('FINANCE_MANAGER','analytics.read'),
 ('RECONCILIATION_ANALYST','transaction.read'),('RECONCILIATION_ANALYST','payment.read'),('RECONCILIATION_ANALYST','refund.read'),('RECONCILIATION_ANALYST','settlement.read'),('RECONCILIATION_ANALYST','settlement.sync'),('RECONCILIATION_ANALYST','reconciliation.read'),('RECONCILIATION_ANALYST','reconciliation.run'),('RECONCILIATION_ANALYST','analytics.read'),
 ('SUPPORT_MANAGER','transaction.read'),('SUPPORT_MANAGER','transaction.query_provider'),('SUPPORT_MANAGER','support.read'),('SUPPORT_MANAGER','support.create'),('SUPPORT_MANAGER','support.update'),('SUPPORT_MANAGER','refund.read'),('SUPPORT_MANAGER','refund.request'),('SUPPORT_MANAGER','provider.read'),('SUPPORT_MANAGER','device.read'),
 ('SUPPORT_AGENT','transaction.read'),('SUPPORT_AGENT','transaction.query_provider'),('SUPPORT_AGENT','support.read'),('SUPPORT_AGENT','support.create'),('SUPPORT_AGENT','support.update'),('SUPPORT_AGENT','provider.read'),('SUPPORT_AGENT','device.read'),
 ('MERCHANT_ADMIN','merchant.read'),('MERCHANT_ADMIN','merchant.manage'),('MERCHANT_ADMIN','catalog.read'),('MERCHANT_ADMIN','catalog.manage'),('MERCHANT_ADMIN','transaction.read'),('MERCHANT_ADMIN','device.read'),('MERCHANT_ADMIN','analytics.read'),
 ('MERCHANT_OPERATOR','merchant.read'),('MERCHANT_OPERATOR','catalog.read'),('MERCHANT_OPERATOR','transaction.read'),('MERCHANT_OPERATOR','device.read'),
 ('TECHNICAL_SUPPORT','transaction.read'),('TECHNICAL_SUPPORT','provider.read'),('TECHNICAL_SUPPORT','provider.health.read'),('TECHNICAL_SUPPORT','provider.health.check'),('TECHNICAL_SUPPORT','alert.read'),('TECHNICAL_SUPPORT','alert.manage'),('TECHNICAL_SUPPORT','incident.read'),('TECHNICAL_SUPPORT','incident.manage'),('TECHNICAL_SUPPORT','device.read'),
 ('AUDITOR','transaction.read'),('AUDITOR','payment.read'),('AUDITOR','refund.read'),('AUDITOR','settlement.read'),('AUDITOR','reconciliation.read'),('AUDITOR','provider.read'),('AUDITOR','merchant.read'),('AUDITOR','catalog.read'),('AUDITOR','admin.audit.read'),('AUDITOR','analytics.read'),
 ('READ_ONLY','transaction.read'),('READ_ONLY','provider.read'),('READ_ONLY','provider.health.read'),('READ_ONLY','merchant.read'),('READ_ONLY','catalog.read'),('READ_ONLY','route.read'),('READ_ONLY','device.read'),('READ_ONLY','payment.read'),('READ_ONLY','refund.read'),('READ_ONLY','settlement.read'),('READ_ONLY','reconciliation.read'),('READ_ONLY','support.read'),('READ_ONLY','alert.read'),('READ_ONLY','incident.read'),('READ_ONLY','analytics.read')
), resolved AS (SELECT r.id role_id,p.id permission_id FROM role_map m JOIN roles r ON r.tenant_id IS NULL AND r.code=m.role_code JOIN permissions p ON p.code=m.permission_code)
INSERT INTO role_permissions(role_id,permission_id) SELECT role_id,permission_id FROM resolved ON CONFLICT DO NOTHING;

-- Customer assurance is read-only for human system roles. Migrations run before seeds on a fresh
-- installation, so the seed must grant these permissions after the roles actually exist.
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.tenant_id IS NULL
  AND r.system_defined=true
  AND p.code IN ('customer.read','customer.identity.read','customer.identity.capability.read')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.tenant_id IS NULL AND r.code='PLATFORM_SUPER_ADMIN'
ON CONFLICT DO NOTHING;

-- Authoritative identity synchronization additionally requires NOLI_IDENTITY_SYNC_SECRET at the
-- HTTP boundary. Do not grant the sync permissions to ordinary system roles.
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id=r.id
  AND rp.permission_id=p.id
  AND r.tenant_id IS NULL
  AND r.system_defined=true
  AND r.code<>'PLATFORM_SUPER_ADMIN'
  AND p.code IN ('customer.identity.sync','customer.identity.capability.sync');

COMMIT;
