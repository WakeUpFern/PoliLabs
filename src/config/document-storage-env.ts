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

export type DocumentStorageConfig =
  | { driver: "local"; dir: string }
  | {
      driver: "s3";
      bucket: string;
      region: string;
      prefix: string;
      endpoint?: string;
      forcePathStyle: boolean;
      credentials?: { accessKeyId: string; secretAccessKey: string };
    };

// "local" for development, "s3" for any deployment whose disk does not
// survive (Vercel) and for AWS. S3-compatible services work via the endpoint.
// Credentials use their own names because Vercel reserves the AWS_* ones.
export function readDocumentStorageConfig(
  env: Record<string, string | undefined>,
  cwd = process.cwd(),
): DocumentStorageConfig {
  const driver = env.DOCUMENT_STORAGE || "local";
  if (driver === "local") {
    if (env.VERCEL)
      throw new Error(
        "DOCUMENT_STORAGE=local loses files on Vercel; set DOCUMENT_STORAGE=s3.",
      );
    return { driver, dir: readDocumentStorageDir(env, cwd) };
  }
  if (driver !== "s3") throw new Error("DOCUMENT_STORAGE must be local or s3.");
  const bucket = env.DOCUMENT_STORAGE_S3_BUCKET;
  const region = env.DOCUMENT_STORAGE_S3_REGION;
  if (!bucket || !region)
    throw new Error(
      "DOCUMENT_STORAGE=s3 needs DOCUMENT_STORAGE_S3_BUCKET and DOCUMENT_STORAGE_S3_REGION.",
    );
  const prefix = env.DOCUMENT_STORAGE_S3_PREFIX ?? "";
  if (prefix && !/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*\/$/.test(prefix))
    throw new Error(
      "DOCUMENT_STORAGE_S3_PREFIX must be path segments ending in /.",
    );
  const endpoint = env.DOCUMENT_STORAGE_S3_ENDPOINT || undefined;
  if (endpoint && !/^https?:\/\//.test(endpoint))
    throw new Error("DOCUMENT_STORAGE_S3_ENDPOINT must be an http(s) URL.");
  const accessKeyId = env.DOCUMENT_STORAGE_S3_ACCESS_KEY_ID;
  const secretAccessKey = env.DOCUMENT_STORAGE_S3_SECRET_ACCESS_KEY;
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey))
    throw new Error(
      "Set both DOCUMENT_STORAGE_S3_ACCESS_KEY_ID and DOCUMENT_STORAGE_S3_SECRET_ACCESS_KEY, or neither.",
    );
  return {
    driver,
    bucket,
    region,
    prefix,
    endpoint,
    forcePathStyle: env.DOCUMENT_STORAGE_S3_FORCE_PATH_STYLE === "true",
    // Without explicit keys the SDK default chain applies (an IAM role on AWS).
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
  };
}
