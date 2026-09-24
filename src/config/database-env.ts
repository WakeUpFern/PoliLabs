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
