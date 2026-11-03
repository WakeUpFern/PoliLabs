import type { DocumentStorageConfig } from "../../../config/document-storage-env";
import type { ObjectStorage } from "../application/object-storage";
import { LocalDiskObjectStorage } from "./local-object-storage";
import { S3ObjectStorage } from "./s3-object-storage";

export function createObjectStorage(
  config: DocumentStorageConfig,
): ObjectStorage {
  return config.driver === "s3"
    ? S3ObjectStorage.fromConfig(config)
    : new LocalDiskObjectStorage(config.dir);
}
