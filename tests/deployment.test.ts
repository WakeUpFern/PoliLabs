import assert from "node:assert/strict";
import test from "node:test";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { readDatabasePoolMax } from "../src/config/database-env";
import { readDocumentStorageConfig } from "../src/config/document-storage-env";
import { findOrphans } from "../src/modules/documents/application/object-storage";
import {
  S3ObjectStorage,
  type S3Sender,
} from "../src/modules/documents/infrastructure/s3-object-storage";

const key = (lab: string, object: string) =>
  `documents/${lab}-0000-4000-8000-000000000000/${object}-0000-4000-8000-000000000000`;
const KEY = key("10000000", "20000000");

// A tiny in-memory bucket that answers the four commands the adapter sends.
function fakeBucket(pageSize = 2) {
  const objects = new Map<string, { bytes: Uint8Array; modified: Date }>();
  const sent: string[] = [];
  const client = {
    async send(command: unknown) {
      if (command instanceof PutObjectCommand) {
        const { Key, Body } = command.input;
        sent.push(`put ${Key}`);
        objects.set(Key!, { bytes: Body as Uint8Array, modified: new Date(0) });
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const object = objects.get(command.input.Key!);
        if (!object)
          throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
        return {
          Body: {
            transformToWebStream: () =>
              new Blob([new Uint8Array(object.bytes)]).stream(),
          },
        };
      }
      if (command instanceof DeleteObjectCommand) {
        sent.push(`delete ${command.input.Key}`);
        objects.delete(command.input.Key!);
        return {};
      }
      if (command instanceof ListObjectsV2Command) {
        const { Prefix = "", ContinuationToken } = command.input;
        const keys = [...objects.keys()]
          .filter((k) => k.startsWith(Prefix))
          .sort();
        const start = ContinuationToken ? Number(ContinuationToken) : 0;
        const page = keys.slice(start, start + pageSize);
        const more = start + pageSize < keys.length;
        return {
          Contents: page.map((Key) => ({
            Key,
            LastModified: objects.get(Key)!.modified,
          })),
          IsTruncated: more,
          NextContinuationToken: more ? String(start + pageSize) : undefined,
        };
      }
      throw new Error("unexpected command");
    },
  } as unknown as S3Sender;
  return { client, objects, sent };
}

test("S3 storage writes, reads, deletes idempotently and rejects bad keys", async () => {
  const bucket = fakeBucket();
  const storage = new S3ObjectStorage(bucket.client, "labora", "prod/");
  await storage.put(KEY, new Uint8Array([1, 2, 3]));
  assert.deepEqual(bucket.sent, [`put prod/${KEY}`]);
  const stream = await storage.get(KEY);
  assert.deepEqual(
    new Uint8Array(await new Response(stream).arrayBuffer()),
    new Uint8Array([1, 2, 3]),
  );
  assert.equal(await storage.get(key("10000000", "30000000")), null);
  await storage.delete(KEY);
  await storage.delete(KEY);
  assert.equal(await storage.get(KEY), null);
  await assert.rejects(storage.put("../etc/passwd", new Uint8Array([1])));
  await assert.rejects(storage.get("documents/x/../../y"));
});

test("S3 listing pages through the bucket and finds old orphans only", async () => {
  const bucket = fakeBucket(2);
  const storage = new S3ObjectStorage(bucket.client, "labora", "prod/");
  const keys = ["20000000", "30000000", "40000000"].map((o) =>
    key("10000000", o),
  );
  for (const k of keys) await storage.put(k, new Uint8Array([1]));
  // Objects outside the prefix or with foreign names are ignored.
  bucket.objects.set("other/thing", {
    bytes: new Uint8Array(),
    modified: new Date(0),
  });
  bucket.objects.set("prod/documents/readme.txt", {
    bytes: new Uint8Array(),
    modified: new Date(0),
  });
  bucket.objects.get(`prod/${keys[2]}`)!.modified = new Date();

  const listed: string[] = [];
  for await (const object of storage.list()) listed.push(object.key);
  assert.deepEqual(listed, keys);

  const orphans = await findOrphans(storage, new Set([keys[0]]), new Date());
  assert.deepEqual(
    orphans.map((o) => o.key),
    [keys[1]],
  );
});

test("storage config defaults to local disk and validates S3 settings", () => {
  assert.equal(readDocumentStorageConfig({}, "/app").driver, "local");
  assert.throws(
    () => readDocumentStorageConfig({ VERCEL: "1" }, "/app"),
    /DOCUMENT_STORAGE=s3/,
  );
  assert.throws(() => readDocumentStorageConfig({ DOCUMENT_STORAGE: "ftp" }));
  assert.throws(
    () => readDocumentStorageConfig({ DOCUMENT_STORAGE: "s3" }),
    /BUCKET/,
  );
  const base = {
    DOCUMENT_STORAGE: "s3",
    DOCUMENT_STORAGE_S3_BUCKET: "labora",
    DOCUMENT_STORAGE_S3_REGION: "us-east-1",
  };
  assert.deepEqual(readDocumentStorageConfig({ ...base, VERCEL: "1" }), {
    driver: "s3",
    bucket: "labora",
    region: "us-east-1",
    prefix: "",
    endpoint: undefined,
    forcePathStyle: false,
    credentials: undefined,
  });
  assert.throws(() =>
    readDocumentStorageConfig({ ...base, DOCUMENT_STORAGE_S3_PREFIX: "/prod" }),
  );
  assert.throws(() =>
    readDocumentStorageConfig({
      ...base,
      DOCUMENT_STORAGE_S3_ACCESS_KEY_ID: "only-one",
    }),
  );
  const config = readDocumentStorageConfig({
    ...base,
    DOCUMENT_STORAGE_S3_PREFIX: "labora/prod/",
    DOCUMENT_STORAGE_S3_ENDPOINT: "https://example.invalid",
    DOCUMENT_STORAGE_S3_FORCE_PATH_STYLE: "true",
    DOCUMENT_STORAGE_S3_ACCESS_KEY_ID: "id",
    DOCUMENT_STORAGE_S3_SECRET_ACCESS_KEY: "secret",
  });
  assert.equal(config.driver === "s3" && config.prefix, "labora/prod/");
  assert.equal(config.driver === "s3" && config.forcePathStyle, true);
});

test("the database pool is small on Vercel unless configured", () => {
  assert.equal(readDatabasePoolMax({}), 5);
  assert.equal(readDatabasePoolMax({ VERCEL: "1" }), 1);
  assert.equal(readDatabasePoolMax({ VERCEL: "1", DATABASE_POOL_MAX: "3" }), 3);
  assert.throws(() => readDatabasePoolMax({ DATABASE_POOL_MAX: "0" }));
  assert.throws(() => readDatabasePoolMax({ DATABASE_POOL_MAX: "many" }));
});
