export type StoredObject = { key: string; modifiedAt: Date };
// Binary storage port. Local disk in development; an S3 adapter will
// implement the same contract without changing services.
export interface ObjectStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
  // null when the object does not exist.
  get(key: string): Promise<ReadableStream<Uint8Array> | null>;
  // Idempotent: deleting a missing object succeeds.
  delete(key: string): Promise<void>;
  list(): AsyncIterable<StoredObject>;
}
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
// Objects without metadata older than the grace period. Younger objects may
// belong to an upload whose transaction has not committed yet.
export async function findOrphans(
  storage: Pick<ObjectStorage, "list">,
  knownKeys: ReadonlySet<string>,
  now: Date,
  graceMs = ORPHAN_GRACE_MS,
) {
  const orphans: StoredObject[] = [];
  for await (const object of storage.list())
    if (
      !knownKeys.has(object.key) &&
      now.getTime() - object.modifiedAt.getTime() >= graceMs
    )
      orphans.push(object);
  return orphans.sort((a, b) => a.key.localeCompare(b.key));
}
