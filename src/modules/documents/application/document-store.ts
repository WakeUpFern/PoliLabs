import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import type {
  DocumentContext,
  DocumentRecord,
  DocumentResource,
  DocumentSummary,
  DocumentTarget,
  NewDocument,
} from "../domain/documents";
export interface DocumentTransaction {
  // Additional locked authorization that depends on the loaded document.
  authorize(permission: PermissionKey): Promise<void>;
  resource(resourceId: string): Promise<DocumentResource>;
  resourceDocuments(resourceId: string): Promise<DocumentSummary[]>;
  // Active evidence of every log of the resource.
  resourceEvidence(resourceId: string): Promise<DocumentSummary[]>;
  // Validates and locks the target; throws when it cannot receive a document.
  lockTarget(target: DocumentTarget): Promise<void>;
  insert(document: NewDocument): Promise<DocumentSummary>;
  document(documentId: string): Promise<DocumentRecord>;
  archive(documentId: string, reason: string): Promise<void>;
}
export interface DocumentStore {
  // Every permission is authorized under lock before the operation runs.
  run<T>(
    context: DocumentContext,
    permissions: readonly [PermissionKey, ...PermissionKey[]],
    operation: (
      tx: DocumentTransaction,
      permissionKeys: readonly string[],
    ) => Promise<T>,
  ): Promise<T>;
}
