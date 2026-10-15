/** Sends due email deliveries from the notifications outbox (retries included). */
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readDatabaseUrl } from "../src/config/database-env";
import { readEmailConfig } from "../src/config/email-env";
import { readAppOrigin } from "../src/config/document-storage-env";
import * as schema from "../src/infrastructure/database/schema";
import { DeliveryDispatcher } from "../src/modules/notifications/application/delivery-dispatcher";
import { DrizzleDeliveryStore } from "../src/modules/notifications/infrastructure/notification-store";
import { FileEmailSender } from "../src/modules/notifications/infrastructure/file-email-sender";
async function main() {
  loadEnvConfig(process.cwd());
  const email = readEmailConfig(process.env);
  if (email.transport === "disabled") {
    console.log("EMAIL_TRANSPORT=disabled; deliveries remain pending.");
    return;
  }
  const pool = new Pool({
    connectionString: readDatabaseUrl(process.env),
    connectionTimeoutMillis: 5000,
  });
  try {
    const result = await new DeliveryDispatcher(
      new DrizzleDeliveryStore(drizzle(pool, { schema })),
      new FileEmailSender(email.outboxDir, email.from),
      readAppOrigin(process.env),
    ).dispatch(500);
    console.log(
      `sent ${result.sent}, retried ${result.retried}, failed ${result.failed}, skipped ${result.skipped}.`,
    );
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Notification dispatch failed. Verify PostgreSQL, DATABASE_URL, BETTER_AUTH_URL and EMAIL_* settings; credentials are not logged.",
  );
  process.exitCode = 1;
});
