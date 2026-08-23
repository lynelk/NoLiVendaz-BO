import pg, { type PoolClient, type QueryResult, type QueryResultRow } from "pg";

const { Pool } = pg;

export interface DatabasePrincipalContext {
  tenantId: string;
  isPlatformAdmin: boolean;
  userId?: string;
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 20),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 5000),
  application_name: process.env.DB_APPLICATION_NAME ?? "nolivendaz-backoffice"
});

export async function withDatabaseClient<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withTenantContext<T>(
  context: DatabasePrincipalContext,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withDatabaseClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        "SELECT set_config('app.tenant_id', $1, true), set_config('app.is_platform_admin', $2, true), set_config('app.user_id', $3, true)",
        [
          context.tenantId,
          context.isPlatformAdmin ? "true" : "false",
          context.userId ?? ""
        ]
      );
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<QueryResult<T>> {
  return pool.query<T>(text, values);
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
