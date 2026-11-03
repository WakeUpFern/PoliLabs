export function readDatabaseUrl(
  env: Record<string, string | undefined>,
): string {
  const value = env.DATABASE_URL;
  const message =
    "DATABASE_URL must be a valid PostgreSQL URL with a host and database name.";
  if (!value) throw new Error(message);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(message);
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    url.pathname.length < 2
  )
    throw new Error(message);
  return value;
}

// Connections per server instance. Each Vercel function instance keeps its
// own pool, so a small value avoids exhausting the database (ADR 0024); use
// the provider's pooled URL there.
export function readDatabasePoolMax(
  env: Record<string, string | undefined>,
): number {
  if (!env.DATABASE_POOL_MAX) return env.VERCEL ? 1 : 5;
  const value = Number(env.DATABASE_POOL_MAX);
  if (!Number.isInteger(value) || value < 1 || value > 50)
    throw new Error("DATABASE_POOL_MAX must be an integer between 1 and 50.");
  return value;
}
