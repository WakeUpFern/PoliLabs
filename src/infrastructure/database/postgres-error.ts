// Drizzle wraps driver errors; the SQLSTATE code may sit on a nested cause.
export function postgresError(error: unknown): {
  code?: string;
  message?: string;
} {
  if (!error || typeof error !== "object") return {};
  if ("code" in error && typeof error.code === "string")
    return {
      code: error.code,
      message: "message" in error ? String(error.message) : undefined,
    };
  return "cause" in error ? postgresError(error.cause) : {};
}
