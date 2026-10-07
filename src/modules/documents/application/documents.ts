import { createHash, randomUUID } from "node:crypto";
import {
  documentBytes,
  documentId,
  documentName,
  documentSource,
  documentText,
  DocumentError,
  MAX_ARCHIVE_REASON,
  MAX_DOCUMENT_TITLE,
  storageKey,
  type DocumentContext,
  type DocumentSummary,
  type DocumentTarget,
} from "../domain/documents";
import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import type { DocumentStore } from "./document-store";
import type { ObjectStorage } from "./object-storage";
export type DocumentUpload = {
  fileName: string;
  bytes: Uint8Array;
  title?: string | null;
  source: string;
};
const uploadPermissions = {
  resource: ["document.upload"],
  "maintenance-log": ["maintenance.create", "document.upload"],
} as const satisfies Record<
  DocumentTarget["kind"],
  readonly [PermissionKey, ...PermissionKey[]]
>;
// Evidence belongs to the maintenance log; manuals to the resource library.
const readPermission = {
  resource: "document.read",
  "maintenance-log": "maintenance.read",
} as const satisfies Record<DocumentTarget["kind"], PermissionKey>;
function groupByLog(documents: DocumentSummary[]) {
  const result = new Map<string, DocumentSummary[]>();
  for (const d of documents)
    if (d.maintenanceLogId)
      result.set(d.maintenanceLogId, [
        ...(result.get(d.maintenanceLogId) ?? []),
        d,
      ]);
  return result;
}
export class DocumentService {
  constructor(
    private readonly store: DocumentStore,
    private readonly storage: ObjectStorage,
    private readonly newObjectId: () => string = randomUUID,
  ) {}
  access(context: DocumentContext) {
    return this.store.run(context, ["laboratory.read"], async (_tx, keys) => ({
      canRead: keys.includes("document.read"),
      canUpload: keys.includes("document.upload"),
      canArchive: keys.includes("document.archive"),
      canReadEvidence: keys.includes("maintenance.read"),
      canAddEvidence:
        keys.includes("maintenance.create") && keys.includes("document.upload"),
    }));
  }
  async resourceDocuments(input: DocumentContext & { resourceId: string }) {
    const id = documentId(input.resourceId);
    return this.store.run(input, ["document.read"], async (tx) => ({
      resource: await tx.resource(id),
      documents: await tx.resourceDocuments(id),
    }));
  }
  async maintenanceEvidence(input: DocumentContext & { resourceId: string }) {
    const id = documentId(input.resourceId);
    return groupByLog(
      await this.store.run(input, ["maintenance.read"], (tx) =>
        tx.resourceEvidence(id),
      ),
    );
  }
  async upload(
    input: DocumentContext & DocumentUpload & { target: DocumentTarget },
  ) {
    const target = input.target;
    const permissions = uploadPermissions[target.kind];
    const originalName = documentName(input.fileName);
    const mediaType = documentBytes(input.bytes);
    const title =
      target.kind === "resource"
        ? documentText(input.title, MAX_DOCUMENT_TITLE, false)
        : null;
    const source = documentSource(input.source);
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    // Reject unauthorized or invalid targets before writing any object.
    await this.store.run(input, permissions, (tx) => tx.lockTarget(target));
    const id = documentId(this.newObjectId());
    const key = storageKey(input.laboratoryId, id);
    await this.storage.put(key, input.bytes);
    try {
      // Authorization and target are revalidated under lock before insert.
      return await this.store.run(input, permissions, async (tx) => {
        await tx.lockTarget(target);
        return tx.insert({
          id,
          storageKey: key,
          target,
          title,
          originalName,
          mediaType,
          byteSize: input.bytes.byteLength,
          sha256,
          source,
        });
      });
    } catch (error) {
      // Compensation. If it fails, the object stays an orphan for the sweep.
      await this.storage.delete(key).catch(() => undefined);
      throw error;
    }
  }
  async download(input: DocumentContext & { documentId: string }) {
    const id = documentId(input.documentId);
    const document = await this.store.run(
      input,
      ["laboratory.read"],
      async (tx) => {
        const record = await tx.document(id);
        if (record.archivedAt) throw new DocumentError("not-found");
        await tx.authorize(readPermission[record.kind]);
        return record;
      },
    );
    const body = await this.storage.get(document.storageKey);
    if (!body) throw new DocumentError("unavailable");
    return { document, body };
  }
  async archive(
    input: DocumentContext & { documentId: string; reason: string },
  ) {
    const id = documentId(input.documentId);
    const reason = documentText(input.reason, MAX_ARCHIVE_REASON, true)!;
    // The row and the object are kept; archiving only hides the document.
    return this.store.run(input, ["document.archive"], async (tx) => {
      const record = await tx.document(id);
      await tx.authorize(readPermission[record.kind]);
      if (record.archivedAt) throw new DocumentError("archived");
      await tx.archive(id, reason);
    });
  }
}
