import { rm } from "node:fs/promises";
import { E2E_DOCUMENT_STORAGE_DIR } from "./constants";

// Specs remove their database rows; stored objects of the run go here.
export default async function globalTeardown() {
  await rm(E2E_DOCUMENT_STORAGE_DIR, { recursive: true, force: true });
}
