import { resolve } from "node:path";
export const DEFAULT_DOCUMENT_STORAGE_DIR = ".local-storage/documents";
// Local disk root for document objects. Never inside public/.
export function readDocumentStorageDir(
  env: Record<string, string | undefined>,
  cwd = process.cwd(),
) {
  const root = resolve(
    cwd,
    env.DOCUMENT_STORAGE_DIR || DEFAULT_DOCUMENT_STORAGE_DIR,
  );
  const publicDir = resolve(cwd, "public");
  if (root === publicDir || root.startsWith(publicDir + "/"))
    throw new Error("DOCUMENT_STORAGE_DIR must not be inside public/.");
  return root;
}
// Origin trusted for state-changing uploads, taken from the auth base URL.
export function readAppOrigin(env: Record<string, string | undefined>) {
  const message = "BETTER_AUTH_URL must be a valid http(s) URL.";
  if (!env.BETTER_AUTH_URL) throw new Error(message);
  let url: URL;
  try {
    url = new URL(env.BETTER_AUTH_URL);
  } catch {
    throw new Error(message);
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(message);
  return url.origin;
}
