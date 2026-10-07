import { rm } from "node:fs/promises";
import { prepareIntegrationDatabase } from "../../integration/database";
import { E2E_DOCUMENT_STORAGE_DIR } from "./constants";

// Creates and migrates the guarded *_test database before any spec runs.
export default async function globalSetup() {
  await prepareIntegrationDatabase();
  await rm(E2E_DOCUMENT_STORAGE_DIR, { recursive: true, force: true });
}
