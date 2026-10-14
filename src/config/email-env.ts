import { resolve } from "node:path";
export const DEFAULT_EMAIL_OUTBOX_DIR = ".local-storage/email-outbox";
export type EmailTransport = "file" | "disabled";
// Only the local file adapter exists; "disabled" leaves deliveries pending.
export function readEmailConfig(
  env: Record<string, string | undefined>,
  cwd = process.cwd(),
) {
  const transport = env.EMAIL_TRANSPORT || "file";
  if (transport !== "file" && transport !== "disabled")
    throw new Error("EMAIL_TRANSPORT must be file or disabled.");
  const from = env.EMAIL_FROM || "Labora <no-reply@labora.invalid>";
  if (/[\r\n]/.test(from) || !from.includes("@"))
    throw new Error("EMAIL_FROM must be a single address.");
  const outboxDir = resolve(
    cwd,
    env.EMAIL_OUTBOX_DIR || DEFAULT_EMAIL_OUTBOX_DIR,
  );
  const publicDir = resolve(cwd, "public");
  if (outboxDir === publicDir || outboxDir.startsWith(publicDir + "/"))
    throw new Error("EMAIL_OUTBOX_DIR must not be inside public/.");
  return { transport: transport as EmailTransport, from, outboxDir };
}
