import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DocumentService } from "../../src/modules/documents/application/documents";
import type { DocumentStore } from "../../src/modules/documents/application/document-store";
import {
  findOrphans,
  type ObjectStorage,
} from "../../src/modules/documents/application/object-storage";
import { DrizzleDocumentStore } from "../../src/modules/documents/infrastructure/document-store";
import { LocalDiskObjectStorage } from "../../src/modules/documents/infrastructure/local-object-storage";
import {
  DocumentError,
  MAX_DOCUMENT_BYTES,
} from "../../src/modules/documents/domain/documents";
import { MaintenanceService } from "../../src/modules/maintenance/application/maintenance";
import { DrizzleMaintenanceStore } from "../../src/modules/maintenance/infrastructure/maintenance-store";
import { AuthorizationDeniedError } from "../../src/modules/identity/domain/access-errors";
import { operationFixture, pgCode, eq, inArray } from "./operation-fixture";

const rejected = (code: string) => (error: unknown) =>
  error instanceof DocumentError && error.code === code;
const text = (value: string) => new TextEncoder().encode(value);
const pdf = (content = "manual") => text(`%PDF-1.7\n${content}`);
const png = () =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]);

test("Documents I metadata, authorization, evidence and storage consistency in PostgreSQL", async (t) => {
  const f = await operationFixture();
  const { db, schema, pool, actor, student, labIds, roleIds, resourceRows } = f;
  const root = await mkdtemp(join(tmpdir(), "labora-documents-it-"));
  const storage = new LocalDiskObjectStorage(root);
  const store = new DrizzleDocumentStore(db);
  const service = new DocumentService(store, storage);
  const maintenance = new MaintenanceService(new DrizzleMaintenanceStore(db));
  t.after(async () => {
    await f.cleanup();
    await rm(root, { recursive: true, force: true });
  });
  const objects = async () => {
    const keys: string[] = [];
    for await (const o of storage.list()) keys.push(o.key);
    return keys.sort();
  };
  const rows = () =>
    db
      .select()
      .from(schema.documents)
      .where(inArray(schema.documents.laboratoryId, labIds));
  const manual = (overrides: Record<string, unknown> = {}) =>
    service.upload({
      ...actor,
      target: { kind: "resource", resourceId: resourceRows[0].id },
      fileName: "Manual del torno.pdf",
      title: "Manual de operación",
      bytes: pdf(),
      ...overrides,
    });
  const logEntry = () =>
    maintenance.record({
      ...actor,
      resourceId: resourceRows[0].id,
      type: "corrective",
      description: "Bitácora escrita a mano",
      statusAfter: "operational",
      performedAt: new Date(Date.now() - 60000).toISOString(),
    });
  const evidence = (maintenanceLogId: string, overrides = {}) =>
    service.upload({
      ...actor,
      target: { kind: "maintenance-log", maintenanceLogId },
      fileName: "foto.png",
      bytes: png(),
      ...overrides,
    });
  // Role 1 (student) starts without document or maintenance permissions.
  const grantStudent = async (key: string) => {
    const [permission] = await db
      .select()
      .from(schema.permissions)
      .where(eq(schema.permissions.key, key));
    await db
      .insert(schema.rolePermissions)
      .values({ roleId: roleIds[1], permissionId: permission.id });
  };

  await t.test(
    "resource manual stores metadata, object and checksum",
    async () => {
      const bytes = pdf("contenido del manual");
      const created = await manual({ bytes });
      assert.equal(created.kind, "resource");
      assert.equal(created.title, "Manual de operación");
      assert.equal(created.mediaType, "application/pdf");
      assert.equal(created.byteSize, bytes.byteLength);
      assert.equal(
        created.sha256,
        createHash("sha256").update(bytes).digest("hex"),
      );
      assert.equal(created.uploadedBy, actor.actorUserId);
      assert.equal(created.source, "WEB");
      const [row] = await db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, created.id));
      assert.equal(row.laboratoryId, actor.laboratoryId);
      assert.equal(row.spaceId, resourceRows[0].spaceId);
      assert.equal(row.originalName, "Manual del torno.pdf");
      assert.match(
        row.storageKey,
        new RegExp(`^documents/${actor.laboratoryId}/[0-9a-f-]{36}$`),
      );
      assert.ok(!row.storageKey.includes("Manual"));
      assert.deepEqual(
        new Uint8Array(await readFile(join(root, row.storageKey))),
        bytes,
      );
      const listed = await service.resourceDocuments({
        ...actor,
        resourceId: resourceRows[0].id,
      });
      assert.equal(listed.resource.name, "Machine");
      assert.deepEqual(
        listed.documents.map((d) => d.id),
        [created.id],
      );
      const download = await service.download({
        ...actor,
        documentId: created.id,
      });
      assert.deepEqual(
        new Uint8Array(await new Response(download.body).arrayBuffer()),
        bytes,
      );
    },
  );

  await t.test(
    "permissions gate upload, library, evidence and archive",
    async () => {
      const created = await manual();
      const before = await objects();
      await assert.rejects(manual({ ...student }), AuthorizationDeniedError);
      assert.deepEqual(await objects(), before);
      await assert.rejects(
        service.resourceDocuments({
          ...student,
          resourceId: resourceRows[0].id,
        }),
        AuthorizationDeniedError,
      );
      await assert.rejects(
        service.download({ ...student, documentId: created.id }),
        AuthorizationDeniedError,
      );
      assert.deepEqual(await service.access(student), {
        canRead: false,
        canUpload: false,
        canArchive: false,
        canReadEvidence: false,
        canAddEvidence: false,
      });
      await grantStudent("document.read");
      const read = await service.download({
        ...student,
        documentId: created.id,
      });
      await read.body.cancel();
      // Reading the library does not expose maintenance evidence.
      const log = await logEntry();
      const photo = await evidence(log.id);
      await assert.rejects(
        service.download({ ...student, documentId: photo.id }),
        AuthorizationDeniedError,
      );
      await assert.rejects(
        service.maintenanceEvidence({
          ...student,
          resourceId: resourceRows[0].id,
        }),
        AuthorizationDeniedError,
      );
      await assert.rejects(
        evidence(log.id, { ...student }),
        AuthorizationDeniedError,
      );
      await assert.rejects(
        service.archive({ ...student, documentId: created.id, reason: "x" }),
        AuthorizationDeniedError,
      );
    },
  );

  await t.test(
    "laboratories are isolated for reads, writes and relations",
    async () => {
      const created = await manual();
      const log = await logEntry();
      const foreign = { ...actor, laboratoryId: labIds[1] };
      await assert.rejects(manual({ ...foreign }), rejected("not-found"));
      await assert.rejects(
        service.download({ ...foreign, documentId: created.id }),
        rejected("not-found"),
      );
      await assert.rejects(
        service.archive({ ...foreign, documentId: created.id, reason: "x" }),
        rejected("not-found"),
      );
      await assert.rejects(
        service.resourceDocuments({
          ...foreign,
          resourceId: resourceRows[0].id,
        }),
        rejected("not-found"),
      );
      await assert.rejects(
        evidence(log.id, { ...foreign }),
        rejected("not-found"),
      );
      await assert.rejects(
        manual({
          target: { kind: "resource", resourceId: resourceRows[2].id },
        }),
        rejected("not-found"),
      );
      // PostgreSQL rejects a resource from another laboratory's space.
      await assert.rejects(
        db.insert(schema.documents).values({
          id: randomUUID(),
          laboratoryId: labIds[1],
          storageKey: `documents/${labIds[1]}/${randomUUID()}`,
          originalName: "x.pdf",
          mediaType: "application/pdf",
          byteSize: 1,
          sha256: "0".repeat(64),
          uploadedBy: actor.actorUserId,
          source: "SYSTEM",
          spaceId: resourceRows[0].spaceId,
          resourceId: resourceRows[0].id,
        }),
        (e: unknown) => pgCode(e) === "23503",
      );
      // A key outside the laboratory prefix or two associations are rejected.
      for (const values of [
        { storageKey: `documents/${labIds[1]}/${randomUUID()}` },
        { maintenanceLogId: log.id },
      ])
        await assert.rejects(
          db.insert(schema.documents).values({
            id: randomUUID(),
            laboratoryId: labIds[0],
            storageKey: `documents/${labIds[0]}/${randomUUID()}`,
            originalName: "x.pdf",
            mediaType: "application/pdf",
            byteSize: 1,
            sha256: "0".repeat(64),
            uploadedBy: actor.actorUserId,
            source: "SYSTEM",
            spaceId: resourceRows[0].spaceId,
            resourceId: resourceRows[0].id,
            ...values,
          }),
          (e: unknown) => pgCode(e) === "23514",
        );
    },
  );

  await t.test(
    "forged signatures and oversized files store nothing",
    async () => {
      const [beforeRows, beforeObjects] = [
        (await rows()).length,
        await objects(),
      ];
      await assert.rejects(
        manual({
          fileName: "manual.pdf",
          bytes: text("<script>alert(1)</script>"),
        }),
        rejected("type"),
      );
      await assert.rejects(
        manual({ fileName: "foto.jpg", bytes: text("<svg onload=alert(1)>") }),
        rejected("type"),
      );
      const big = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
      big.set(pdf());
      await assert.rejects(manual({ bytes: big }), rejected("too-large"));
      // A PNG named .pdf is stored as what its bytes say it is.
      const renamed = await manual({ fileName: "foto.pdf", bytes: png() });
      assert.equal(renamed.mediaType, "image/png");
      assert.equal((await rows()).length, beforeRows + 1);
      assert.equal((await objects()).length, beforeObjects.length + 1);
    },
  );

  await t.test(
    "evidence is added without editing the immutable log",
    async () => {
      const log = await logEntry();
      const snapshot = async () =>
        (
          await pool.query("select * from maintenance_logs where id = $1", [
            log.id,
          ])
        ).rows[0];
      const before = await snapshot();
      const first = await evidence(log.id, { title: "ignored" });
      await evidence(log.id, { fileName: "bitacora.pdf", bytes: pdf("hoja") });
      assert.equal(first.kind, "maintenance-log");
      assert.equal(first.title, null);
      assert.deepEqual(await snapshot(), before);
      const grouped = await service.maintenanceEvidence({
        ...actor,
        resourceId: resourceRows[0].id,
      });
      assert.deepEqual(
        grouped.get(log.id)?.map((d) => d.originalName),
        ["foto.png", "bitacora.pdf"],
      );
      await assert.rejects(
        pool.query(
          "update maintenance_logs set description = 'edit' where id = $1",
          [log.id],
        ),
        (e: unknown) => pgCode(e) === "23514",
      );
      // Missing logs and archived evidence follow the per-entry limit.
      await assert.rejects(evidence(randomUUID()), rejected("not-found"));
      for (let i = 2; i < 10; i++) await evidence(log.id);
      await assert.rejects(evidence(log.id), rejected("limit"));
      await service.archive({
        ...actor,
        documentId: first.id,
        reason: "Foto equivocada",
      });
      await evidence(log.id);
      await assert.rejects(evidence(log.id), rejected("limit"));
      // PostgreSQL enforces the limit even without the service.
      await assert.rejects(
        db.insert(schema.documents).values({
          id: randomUUID(),
          laboratoryId: labIds[0],
          storageKey: `documents/${labIds[0]}/${randomUUID()}`,
          originalName: "x.png",
          mediaType: "image/png",
          byteSize: 1,
          sha256: "0".repeat(64),
          uploadedBy: actor.actorUserId,
          source: "SYSTEM",
          maintenanceLogId: log.id,
        }),
        (e: unknown) => pgCode(e) === "23514",
      );
      assert.deepEqual(await snapshot(), before);
    },
  );

  await t.test(
    "concurrent evidence respects the limit and leaves no orphans",
    async () => {
      const log = await logEntry();
      for (let i = 0; i < 9; i++) await evidence(log.id);
      const results = await Promise.allSettled([
        evidence(log.id),
        evidence(log.id),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const failure = results.find((r) => r.status === "rejected");
      assert.ok(failure && rejected("limit")(failure.reason));
      const keys = new Set((await rows()).map((r) => r.storageKey));
      assert.deepEqual(await findOrphans(storage, keys, new Date(), 0), []);
    },
  );

  await t.test(
    "a failure mid-upload compensates or leaves a sweepable orphan",
    async () => {
      const beforeObjects = await objects();
      const beforeRows = (await rows()).length;
      const failingPut: ObjectStorage = {
        ...storage,
        list: () => storage.list(),
        get: (k) => storage.get(k),
        delete: (k) => storage.delete(k),
        put: async () => {
          throw new Error("disk full");
        },
      };
      await assert.rejects(
        new DocumentService(store, failingPut).upload({
          ...actor,
          target: { kind: "resource", resourceId: resourceRows[0].id },
          fileName: "manual.pdf",
          bytes: pdf(),
          source: "WEB",
        }),
        /disk full/,
      );
      // The transaction fails after the object was written: compensation deletes it.
      let calls = 0;
      const failingCommit: DocumentStore = {
        run: (context, permissions, operation) =>
          store.run(context, permissions, async (tx, keys) => {
            const result = await operation(tx, keys);
            if (++calls === 2) throw new Error("connection lost");
            return result;
          }),
      };
      await assert.rejects(
        new DocumentService(failingCommit, storage).upload({
          ...actor,
          target: { kind: "resource", resourceId: resourceRows[0].id },
          fileName: "manual.pdf",
          bytes: pdf(),
          source: "WEB",
        }),
        /connection lost/,
      );
      assert.equal(calls, 2);
      assert.equal((await rows()).length, beforeRows);
      assert.deepEqual(await objects(), beforeObjects);
      // If compensation also fails, the object is an orphan found by the sweep.
      calls = 0;
      const failingDelete: ObjectStorage = {
        list: () => storage.list(),
        get: (k) => storage.get(k),
        put: (k, b) => storage.put(k, b),
        delete: async () => {
          throw new Error("delete failed");
        },
      };
      await assert.rejects(
        new DocumentService(failingCommit, failingDelete).upload({
          ...actor,
          target: { kind: "resource", resourceId: resourceRows[0].id },
          fileName: "manual.pdf",
          bytes: pdf(),
          source: "WEB",
        }),
        /connection lost/,
      );
      assert.equal((await rows()).length, beforeRows);
      const known = new Set(
        (await db.select().from(schema.documents)).map((r) => r.storageKey),
      );
      const orphans = await findOrphans(storage, known, new Date(), 0);
      assert.equal(orphans.length, 1);
      assert.match(orphans[0].key, new RegExp(`^documents/${labIds[0]}/`));
      // Within the grace period the sweep leaves it alone.
      assert.deepEqual(await findOrphans(storage, known, new Date()), []);
      await storage.delete(orphans[0].key);
      assert.deepEqual(await objects(), beforeObjects);
    },
  );

  await t.test(
    "archive is logical, single and the only allowed change",
    async () => {
      const created = await manual();
      await assert.rejects(
        service.archive({ ...actor, documentId: created.id, reason: "  " }),
        rejected("input"),
      );
      await service.archive({
        ...actor,
        documentId: created.id,
        reason: "Versión obsoleta",
      });
      const [row] = await db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, created.id));
      assert.equal(row.archivedBy, actor.actorUserId);
      assert.equal(row.archiveReason, "Versión obsoleta");
      assert.ok(row.archivedAt);
      // The object is kept, but the document is hidden and not downloadable.
      await readFile(join(root, row.storageKey));
      const listed = await service.resourceDocuments({
        ...actor,
        resourceId: resourceRows[0].id,
      });
      assert.ok(!listed.documents.some((d) => d.id === created.id));
      await assert.rejects(
        service.download({ ...actor, documentId: created.id }),
        rejected("not-found"),
      );
      await assert.rejects(
        service.archive({ ...actor, documentId: created.id, reason: "again" }),
        rejected("archived"),
      );
      for (const statement of [
        "update documents set archived_at = null, archived_by = null, archive_reason = null where id = $1",
        "update documents set archive_reason = 'otro' where id = $1",
      ])
        await assert.rejects(
          pool.query(statement, [created.id]),
          (e: unknown) => pgCode(e) === "23514",
        );
      const active = await manual();
      await assert.rejects(
        pool.query(
          "update documents set original_name = 'renamed.pdf' where id = $1",
          [active.id],
        ),
        (e: unknown) => pgCode(e) === "23514",
      );
      // A missing object surfaces as unavailable, never as another file.
      const [activeRow] = await db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, active.id));
      await storage.delete(activeRow.storageKey);
      await assert.rejects(
        service.download({ ...actor, documentId: active.id }),
        rejected("unavailable"),
      );
    },
  );
});
