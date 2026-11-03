import "server-only";
import { getDatabase } from "@/infrastructure/database/client";
import { readDocumentStorageConfig } from "@/config/document-storage-env";
import { DocumentService } from "../application/documents";
import { DrizzleDocumentStore } from "./document-store";
import { createObjectStorage } from "./object-storage-factory";
export const documentService = new DocumentService(
  new DrizzleDocumentStore(getDatabase()),
  createObjectStorage(readDocumentStorageConfig(process.env)),
);
