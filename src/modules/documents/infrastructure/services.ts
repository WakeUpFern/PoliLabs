import "server-only";
import { getDatabase } from "@/infrastructure/database/client";
import { readDocumentStorageDir } from "@/config/document-storage-env";
import { DocumentService } from "../application/documents";
import { DrizzleDocumentStore } from "./document-store";
import { LocalDiskObjectStorage } from "./local-object-storage";
// Only the local adapter exists; an S3 adapter will be selected here.
export const documentService = new DocumentService(
  new DrizzleDocumentStore(getDatabase()),
  new LocalDiskObjectStorage(readDocumentStorageDir(process.env)),
);
