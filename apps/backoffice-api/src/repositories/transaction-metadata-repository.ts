import type { Principal } from "@nolivendaz/canonical-models";
import { withTenantContext } from "@nolivendaz/database";

const context = (principal: Principal) => ({
  tenantId: principal.tenantId,
  isPlatformAdmin: principal.isPlatformAdmin,
  userId: principal.userId
});

export async function getTransactionMetadata(
  principal: Principal,
  transactionId: string
): Promise<Record<string, unknown>> {
  return withTenantContext(context(principal), async (client) => {
    const row = (await client.query(
      `SELECT transaction_metadata AS metadata
         FROM transactions
        WHERE id = $1 AND tenant_id = $2`,
      [transactionId, principal.tenantId]
    )).rows[0];
    if (!row) throw new Error("TRANSACTION_NOT_FOUND");
    const metadata = row.metadata;
    return metadata && typeof metadata === "object"
      ? metadata as Record<string, unknown>
      : {};
  });
}
