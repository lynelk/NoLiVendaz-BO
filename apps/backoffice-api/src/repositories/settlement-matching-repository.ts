import type { Principal } from "@nolivendaz/canonical-models";
import type { ProviderSettlement } from "@nolivendaz/provider-sdk";
import { withTenantContext } from "@nolivendaz/database";

const context = (principal: Principal) => ({
  tenantId: principal.tenantId,
  isPlatformAdmin: principal.isPlatformAdmin,
  userId: principal.userId
});

const COMPLETE_SETTLEMENT_STATUSES = new Set([
  "SETTLED",
  "COMPLETED",
  "SUCCESS",
  "SUCCEEDED",
  "PAID"
]);

export interface SettlementMatchResult {
  settlementsProcessed: number;
  transactionLinksCreated: number;
  unmatchedReferences: string[];
  ambiguousReferences: string[];
}

export async function matchSettlementReferences(
  principal: Principal,
  providerId: string,
  connectorId: string,
  settlements: ProviderSettlement[]
): Promise<SettlementMatchResult> {
  return withTenantContext(context(principal), async (client) => {
    let transactionLinksCreated = 0;
    const unmatchedReferences: string[] = [];
    const ambiguousReferences: string[] = [];

    for (const settlement of settlements) {
      if (!settlement.transactionReferences?.length) continue;

      const settlementRow = (await client.query(
        `SELECT id,provider_status
           FROM provider_settlements
          WHERE tenant_id=$1 AND provider_id=$2 AND connector_id=$3
            AND provider_settlement_id=$4`,
        [principal.tenantId, providerId, connectorId, settlement.providerSettlementId]
      )).rows[0];
      if (!settlementRow) throw new Error("NORMALIZED_SETTLEMENT_NOT_FOUND");

      const complete = COMPLETE_SETTLEMENT_STATUSES.has(
        String(settlementRow.provider_status).toUpperCase()
      );

      for (const reference of settlement.transactionReferences) {
        const matches = (await client.query(
          `SELECT id,total_amount::text AS "totalAmount"
             FROM transactions
            WHERE tenant_id=$1
              AND provider_id=$2
              AND connector_id=$3
              AND provider_transaction_id=$4
              AND currency=$5
              AND vend_status='FULFILLED'
              AND settlement_blocked=false`,
          [principal.tenantId, providerId, connectorId, reference, settlement.currency]
        )).rows;

        if (matches.length === 0) {
          unmatchedReferences.push(reference);
          continue;
        }
        if (matches.length > 1) {
          ambiguousReferences.push(reference);
          continue;
        }
        const transaction = matches[0]!;

        const linked = await client.query(
          `INSERT INTO settlement_transaction_links(
             tenant_id,settlement_id,transaction_id,match_source,matched_amount,matched_by
           ) VALUES($1,$2,$3,'PROVIDER_REFERENCE',$4,$5)
           ON CONFLICT(settlement_id,transaction_id) DO NOTHING
           RETURNING id`,
          [
            principal.tenantId,
            settlementRow.id,
            transaction.id,
            transaction.totalAmount,
            principal.userId
          ]
        );
        transactionLinksCreated += linked.rowCount ?? 0;

        if (complete) {
          await client.query(
            `UPDATE transactions
                SET settlement_status='SETTLED',
                    normalized_status=CASE
                      WHEN normalized_status='FULFILLED' THEN 'SETTLED'
                      ELSE normalized_status
                    END,
                    updated_at=now()
              WHERE id=$1`,
            [transaction.id]
          );
        }
      }
    }

    await client.query(
      `INSERT INTO audit_logs(
         tenant_id,actor_user_id,action,resource_type,after_state
       ) VALUES($1,$2,'settlement.reference_match','settlement',$3::jsonb)`,
      [
        principal.tenantId,
        principal.userId,
        JSON.stringify({
          providerId,
          connectorId,
          settlementsProcessed: settlements.length,
          transactionLinksCreated,
          unmatchedReferences,
          ambiguousReferences
        })
      ]
    );

    return {
      settlementsProcessed: settlements.length,
      transactionLinksCreated,
      unmatchedReferences,
      ambiguousReferences
    };
  });
}

export async function listSettlementMatches(principal: Principal, settlementId: string) {
  return withTenantContext(context(principal), async (client) => (
    await client.query(
      `SELECT
         stl.id,stl.match_source AS "matchSource",stl.matched_amount::text AS "matchedAmount",
         stl.matched_at AS "matchedAt",t.id AS "transactionId",
         t.transaction_reference AS "transactionReference",
         t.provider_transaction_id AS "providerTransactionId",
         t.currency,t.total_amount::text AS "transactionAmount"
       FROM settlement_transaction_links stl
       JOIN transactions t ON t.id=stl.transaction_id
       WHERE stl.settlement_id=$1
       ORDER BY stl.matched_at`,
      [settlementId]
    )
  ).rows);
}
