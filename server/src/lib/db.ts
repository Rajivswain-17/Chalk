import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { env } from "./env";

const client = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

/** Shared typed database connection for this process. */
export const db = drizzle(client);
export { sql };

/** Readiness probe used by Docker and orchestration checks. */
export async function checkDatabase(): Promise<void> {
  await client`select 1`;
}

/** Gracefully close the postgres-js connection pool. */
export async function closeDatabase(): Promise<void> {
  await client.end({ timeout: 5 });
}
