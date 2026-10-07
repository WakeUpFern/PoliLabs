import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  authorizeLocked,
  type OperationDatabase,
  type OperationTransaction,
} from "@/modules/identity/infrastructure/authorize-locked";
import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import { users } from "@/modules/identity/infrastructure/auth-schema";
import {
  spaces,
  resources,
} from "@/modules/spatial/infrastructure/spatial-schema";
import { maintenanceLogs } from "@/modules/maintenance/infrastructure/maintenance-schema";
import { documents } from "./document-schema";
import {
  DocumentError,
  documentId,
  MAX_EVIDENCE_PER_LOG,
  type DocumentContext,
  type DocumentRecord,
  type DocumentSummary,
  type DocumentTarget,
  type NewDocument,
} from "../domain/documents";
import type {
  DocumentStore,
  DocumentTransaction,
} from "../application/document-store";
function postgresError(error: unknown): { code?: string; message?: string } {
  if (!error || typeof error !== "object") return {};
  if ("code" in error) return error as { code: string; message?: string };
  if ("cause" in error) return postgresError(error.cause);
  return {};
}
const summaryColumns = {
  id: documents.id,
  title: documents.title,
  originalName: documents.originalName,
  mediaType: documents.mediaType,
  byteSize: documents.byteSize,
  sha256: documents.sha256,
  uploadedBy: documents.uploadedBy,
  uploaderName: users.name,
  source: documents.source,
  createdAt: documents.createdAt,
  resourceId: documents.resourceId,
  maintenanceLogId: documents.maintenanceLogId,
};
type SummaryRow = Omit<DocumentSummary, "kind">;
const withKind = <T extends SummaryRow>(row: T) => ({
  ...row,
  kind: row.resourceId ? ("resource" as const) : ("maintenance-log" as const),
});
class DrizzleDocumentTransaction implements DocumentTransaction {
  constructor(
    private readonly tx: OperationTransaction,
    private readonly context: DocumentContext,
  ) {}
  async authorize(permission: PermissionKey) {
    await authorizeLocked(this.tx, this.context, permission);
  }
  async resource(resourceId: string) {
    // Deactivated resources keep their library readable inside the laboratory.
    const [row] = await this.tx
      .select({
        id: resources.id,
        name: resources.name,
        spaceId: resources.spaceId,
        spaceName: spaces.name,
        isActive: sql<boolean>`${resources.isActive} and ${spaces.isActive}`,
      })
      .from(resources)
      .innerJoin(spaces, eq(spaces.id, resources.spaceId))
      .where(
        and(
          eq(resources.id, resourceId),
          eq(spaces.laboratoryId, this.context.laboratoryId),
        ),
      );
    if (!row) throw new DocumentError("not-found");
    return row;
  }
  async resourceDocuments(resourceId: string) {
    const rows = await this.tx
      .select(summaryColumns)
      .from(documents)
      .innerJoin(users, eq(users.id, documents.uploadedBy))
      .where(
        and(
          eq(documents.laboratoryId, this.context.laboratoryId),
          eq(documents.resourceId, resourceId),
          isNull(documents.archivedAt),
        ),
      )
      .orderBy(desc(documents.createdAt), desc(documents.id));
    return rows.map(withKind);
  }
  async resourceEvidence(resourceId: string) {
    const rows = await this.tx
      .select(summaryColumns)
      .from(documents)
      .innerJoin(users, eq(users.id, documents.uploadedBy))
      .innerJoin(
        maintenanceLogs,
        eq(maintenanceLogs.id, documents.maintenanceLogId),
      )
      .where(
        and(
          eq(documents.laboratoryId, this.context.laboratoryId),
          eq(maintenanceLogs.laboratoryId, this.context.laboratoryId),
          eq(maintenanceLogs.resourceId, resourceId),
          isNull(documents.archivedAt),
        ),
      )
      .orderBy(documents.createdAt, documents.id);
    return rows.map(withKind);
  }
  private spaceOf?: string;
  async lockTarget(target: DocumentTarget) {
    if (target.kind === "resource") {
      // Lock order Space -> Resource, as Maintenance, Usage and Reservations.
      const [ref] = await this.tx
        .select({ spaceId: resources.spaceId })
        .from(resources)
        .innerJoin(spaces, eq(spaces.id, resources.spaceId))
        .where(
          and(
            eq(resources.id, target.resourceId),
            eq(spaces.laboratoryId, this.context.laboratoryId),
          ),
        );
      if (!ref) throw new DocumentError("not-found");
      const [space] = await this.tx
        .select({ id: spaces.id, isActive: spaces.isActive })
        .from(spaces)
        .where(
          and(
            eq(spaces.id, ref.spaceId),
            eq(spaces.laboratoryId, this.context.laboratoryId),
          ),
        )
        .for("share");
      if (!space?.isActive) throw new DocumentError("not-found");
      const [resource] = await this.tx
        .select({ id: resources.id, isActive: resources.isActive })
        .from(resources)
        .where(
          and(
            eq(resources.id, target.resourceId),
            eq(resources.spaceId, space.id),
          ),
        )
        .for("share");
      if (!resource?.isActive) throw new DocumentError("not-found");
      this.spaceOf = space.id;
      return;
    }
    // The log is locked, never updated: its immutability trigger is untouched.
    const [log] = await this.tx
      .select({ id: maintenanceLogs.id })
      .from(maintenanceLogs)
      .where(
        and(
          eq(maintenanceLogs.id, target.maintenanceLogId),
          eq(maintenanceLogs.laboratoryId, this.context.laboratoryId),
        ),
      )
      .for("update");
    if (!log) throw new DocumentError("not-found");
    const [evidence] = await this.tx
      .select({ value: sql<number>`count(*)::integer` })
      .from(documents)
      .where(
        and(
          eq(documents.maintenanceLogId, log.id),
          isNull(documents.archivedAt),
        ),
      );
    if (evidence.value >= MAX_EVIDENCE_PER_LOG)
      throw new DocumentError("limit");
  }
  async insert(document: NewDocument) {
    const target = document.target;
    if (target.kind === "resource" && !this.spaceOf)
      throw new DocumentError("not-found");
    await this.tx.insert(documents).values({
      id: document.id,
      laboratoryId: this.context.laboratoryId,
      storageKey: document.storageKey,
      title: document.title,
      originalName: document.originalName,
      mediaType: document.mediaType,
      byteSize: document.byteSize,
      sha256: document.sha256,
      uploadedBy: this.context.actorUserId,
      source: document.source,
      createdAt: sql`clock_timestamp()`,
      spaceId: target.kind === "resource" ? this.spaceOf : null,
      resourceId: target.kind === "resource" ? target.resourceId : null,
      maintenanceLogId:
        target.kind === "maintenance-log" ? target.maintenanceLogId : null,
    });
    const record = await this.document(document.id);
    return {
      id: record.id,
      kind: record.kind,
      title: record.title,
      originalName: record.originalName,
      mediaType: record.mediaType,
      byteSize: record.byteSize,
      sha256: record.sha256,
      uploadedBy: record.uploadedBy,
      uploaderName: record.uploaderName,
      source: record.source,
      createdAt: record.createdAt,
      resourceId: record.resourceId,
      maintenanceLogId: record.maintenanceLogId,
    };
  }
  async document(id: string): Promise<DocumentRecord> {
    const [row] = await this.tx
      .select({
        ...summaryColumns,
        laboratoryId: documents.laboratoryId,
        storageKey: documents.storageKey,
        archivedAt: documents.archivedAt,
      })
      .from(documents)
      .innerJoin(users, eq(users.id, documents.uploadedBy))
      .where(
        and(
          eq(documents.id, id),
          eq(documents.laboratoryId, this.context.laboratoryId),
        ),
      );
    if (!row) throw new DocumentError("not-found");
    return withKind(row);
  }
  async archive(id: string, reason: string) {
    const archived = await this.tx
      .update(documents)
      .set({
        archivedAt: sql`clock_timestamp()`,
        archivedBy: this.context.actorUserId,
        archiveReason: reason,
      })
      .where(
        and(
          eq(documents.id, id),
          eq(documents.laboratoryId, this.context.laboratoryId),
          isNull(documents.archivedAt),
        ),
      )
      .returning({ id: documents.id });
    if (!archived.length) throw new DocumentError("archived");
  }
}
export class DrizzleDocumentStore implements DocumentStore {
  constructor(private readonly db: OperationDatabase) {}
  async run<T>(
    context: DocumentContext,
    permissions: readonly [PermissionKey, ...PermissionKey[]],
    operation: (
      tx: DocumentTransaction,
      permissionKeys: readonly string[],
    ) => Promise<T>,
  ): Promise<T> {
    documentId(context.actorUserId);
    documentId(context.laboratoryId);
    try {
      return await this.db.transaction(
        async (tx) => {
          let keys: readonly string[] = [];
          for (const permission of permissions)
            keys = (await authorizeLocked(tx, context, permission))
              .permissionKeys;
          return operation(new DrizzleDocumentTransaction(tx, context), keys);
        },
        { isolationLevel: "read committed" },
      );
    } catch (error) {
      const pg = postgresError(error);
      if (pg.code === "23503") throw new DocumentError("not-found");
      if (pg.code === "23514") {
        if (pg.message?.includes("evidence-limit"))
          throw new DocumentError("limit");
        throw new DocumentError("input");
      }
      throw error;
    }
  }
}
