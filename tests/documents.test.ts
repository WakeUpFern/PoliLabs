import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  contentDisposition,
  documentBytes,
  documentName,
  documentTarget,
  DocumentError,
  MAX_DOCUMENT_BYTES,
  sniffMediaType,
  storageKey,
} from "../src/modules/documents/domain/documents";
import { DocumentService } from "../src/modules/documents/application/documents";
import type { DocumentStore } from "../src/modules/documents/application/document-store";
import {
  findOrphans,
  type ObjectStorage,
} from "../src/modules/documents/application/object-storage";
import { LocalDiskObjectStorage } from "../src/modules/documents/infrastructure/local-object-storage";
import {
  assertSameOrigin,
  readLimitedBody,
  UploadRejectedError,
} from "../src/modules/documents/web/documents-web";
import { readDocumentStorageDir } from "../src/config/document-storage-env";
const id = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";
const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);
export const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2);
const rejected = (code: string) => (error: unknown) =>
  error instanceof DocumentError && error.code === code;
test("media type comes from leading bytes, not from the name", () => {
  assert.equal(sniffMediaType(text("%PDF-1.7\n")), "application/pdf");
  assert.equal(sniffMediaType(PNG), "image/png");
  assert.equal(sniffMediaType(bytes(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(sniffMediaType(text("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  for (const fake of [
    text("<svg xmlns='http://www.w3.org/2000/svg'/>"),
    text("hello.pdf"),
    text("RIFF\0\0\0\0WAVE"),
    bytes(0x50, 0x4b, 0x03, 0x04),
    bytes(0x89, 0x50, 0x4e),
    bytes(),
  ])
    assert.equal(sniffMediaType(fake), null);
  assert.throws(() => documentBytes(text("plain text")), rejected("type"));
  assert.throws(() => documentBytes(bytes()), rejected("input"));
  const big = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
  big.set(text("%PDF-"));
  assert.throws(() => documentBytes(big), rejected("too-large"));
  const max = new Uint8Array(MAX_DOCUMENT_BYTES);
  max.set(text("%PDF-"));
  assert.equal(documentBytes(max), "application/pdf");
});
test("names are display-only and storage keys are random and scoped", () => {
  assert.equal(documentName("C:\\fotos\\bitácora.jpg"), "bitácora.jpg");
  assert.equal(documentName("../../etc/passwd"), "passwd");
  assert.equal(documentName(" a\u0000b\nc.pdf "), "abc.pdf");
  assert.equal([...documentName("ñ".repeat(300))].length, 255);
  for (const name of ["", "  ", "dir/", "..", "."])
    assert.throws(() => documentName(name), rejected("input"));
  assert.equal(storageKey(id, other), `documents/${id}/${other}`);
  assert.throws(() => storageKey(id, "../x"), rejected("input"));
  assert.deepEqual(documentTarget("resource", id.toUpperCase()), {
    kind: "resource",
    resourceId: id,
  });
  assert.throws(() => documentTarget("incident", id), rejected("input"));
  assert.equal(
    contentDisposition('manual "torno" ñ.pdf'),
    `inline; filename="manual _torno_ _.pdf"; filename*=UTF-8''manual%20%22torno%22%20%C3%B1.pdf`,
  );
});
test("uploads require the same origin and stop reading past the limit", async () => {
  const headers = (values: Record<string, string>) => new Headers(values);
  assert.doesNotThrow(() =>
    assertSameOrigin(
      headers({ origin: "http://localhost:3000" }),
      "http://localhost:3000",
    ),
  );
  for (const origin of [
    undefined,
    "null",
    "http://evil.test",
    "http://localhost:3001",
  ])
    assert.throws(
      () =>
        assertSameOrigin(
          headers(origin ? { origin } : {}),
          "http://localhost:3000",
        ),
      UploadRejectedError,
    );
  await assert.rejects(
    readLimitedBody(headers({ "content-length": "11" }), null, 10),
    (e: unknown) => e instanceof UploadRejectedError && e.code === "too-large",
  );
  let pulled = 0,
    cancelled = false;
  const endless = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled++;
      controller.enqueue(new Uint8Array(4));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    readLimitedBody(headers({}), endless, 10),
    (e: unknown) => e instanceof UploadRejectedError && e.code === "too-large",
  );
  assert.ok(cancelled);
  assert.ok(pulled <= 4);
  const ok = new Blob([text("hello")]).stream();
  assert.deepEqual(
    await readLimitedBody(headers({ "content-length": "5" }), ok, 10),
    text("hello"),
  );
});
test("the service validates files before touching storage or the database", async () => {
  let runs = 0,
    puts = 0;
  const store: DocumentStore = {
    run: async () => {
      runs++;
      throw new Error("unreachable");
    },
  };
  const storage = {
    put: async () => {
      puts++;
    },
  } as unknown as ObjectStorage;
  const service = new DocumentService(store, storage);
  const base = {
    actorUserId: id,
    laboratoryId: other,
    source: "WEB",
    target: { kind: "resource", resourceId: id } as const,
    fileName: "manual.pdf",
  };
  await assert.rejects(
    service.upload({ ...base, bytes: text("not really a pdf") }),
    rejected("type"),
  );
  const big = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
  big.set(text("%PDF-"));
  await assert.rejects(
    service.upload({ ...base, bytes: big }),
    rejected("too-large"),
  );
  await assert.rejects(
    service.upload({ ...base, bytes: PNG, title: "x".repeat(201) }),
    rejected("input"),
  );
  await assert.rejects(
    service.upload({ ...base, bytes: PNG, source: "CLIENT" }),
    rejected("input"),
  );
  await assert.rejects(
    service.archive({
      actorUserId: id,
      laboratoryId: other,
      documentId: id,
      reason: " ",
    }),
    rejected("input"),
  );
  assert.equal(runs, 0);
  assert.equal(puts, 0);
});
test("local storage writes atomically, rejects traversal and finds old orphans", async () => {
  const root = await mkdtemp(join(tmpdir(), "labora-documents-"));
  try {
    const storage = new LocalDiskObjectStorage(root);
    const key = storageKey(id, other);
    await storage.put(key, PNG);
    assert.deepEqual(new Uint8Array(await readFile(join(root, key))), PNG);
    const stream = await storage.get(key);
    assert.deepEqual(
      new Uint8Array(await new Response(stream).arrayBuffer()),
      PNG,
    );
    assert.equal(await storage.get(storageKey(id, id)), null);
    await assert.rejects(storage.put("../escape", PNG));
    await assert.rejects(storage.get(`documents/${id}/../../x`));
    // A stale temporary file from an interrupted write is also an orphan.
    await mkdir(join(root, ".tmp"), { recursive: true });
    const stale = join(root, ".tmp", "a".repeat(32));
    await writeFile(stale, "partial");
    const old = new Date(Date.now() - 2 * 24 * 3600 * 1000);
    await utimes(stale, old, old);
    const now = new Date();
    assert.deepEqual(
      (await findOrphans(storage, new Set([key]), now)).map((o) => o.key),
      [`.tmp/${"a".repeat(32)}`],
    );
    // Young objects without metadata may belong to an upload in progress.
    assert.deepEqual(
      (await findOrphans(storage, new Set(), now)).map((o) => o.key),
      [`.tmp/${"a".repeat(32)}`],
    );
    assert.equal((await findOrphans(storage, new Set(), now, 0)).length, 2);
    await storage.delete(key);
    await storage.delete(key);
    assert.equal(await storage.get(key), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("storage directory defaults outside public/", () => {
  assert.equal(
    readDocumentStorageDir({}, "/srv/app"),
    "/srv/app/.local-storage/documents",
  );
  assert.equal(
    readDocumentStorageDir({ DOCUMENT_STORAGE_DIR: "/data/docs" }, "/srv/app"),
    "/data/docs",
  );
  assert.throws(() =>
    readDocumentStorageDir({ DOCUMENT_STORAGE_DIR: "public/docs" }, "/srv/app"),
  );
});
