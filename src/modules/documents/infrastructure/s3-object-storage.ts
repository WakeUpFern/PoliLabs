import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import type {
  ObjectStorage,
  StoredObject,
} from "../application/object-storage";
import { STORAGE_KEY_PATTERN } from "../domain/documents";

/** The part of S3Client this adapter uses, so tests can replace it. */
export type S3Sender = Pick<S3Client, "send">;

// Production adapter (ADR 0024). A single PUT is atomic in S3, so readers
// never see a partial object and no temporary keys are needed. Objects stay
// private: they are only served through the authorized download route.
export class S3ObjectStorage implements ObjectStorage {
  constructor(
    private readonly client: S3Sender,
    private readonly bucket: string,
    private readonly prefix = "",
  ) {}

  static fromConfig(config: {
    bucket: string;
    region: string;
    prefix: string;
    endpoint?: string;
    forcePathStyle: boolean;
    credentials?: S3ClientConfig["credentials"];
  }) {
    return new S3ObjectStorage(
      new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle,
        credentials: config.credentials,
      }),
      config.bucket,
      config.prefix,
    );
  }

  private objectKey(key: string) {
    if (!STORAGE_KEY_PATTERN.test(key)) throw new Error("Invalid object key.");
    return this.prefix + key;
  }

  async put(key: string, bytes: Uint8Array) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
        Body: bytes,
        ContentLength: bytes.byteLength,
        ContentType: "application/octet-stream",
      }),
    );
  }

  async get(key: string) {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
      );
      return result.Body ? result.Body.transformToWebStream() : null;
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === "NoSuchKey" || name === "NotFound") return null;
      throw error;
    }
  }

  async delete(key: string) {
    // S3 deletes are idempotent: a missing key succeeds.
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
      }),
    );
  }

  async *list(): AsyncIterable<StoredObject> {
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: `${this.prefix}documents/`,
          ContinuationToken: token,
        }),
      );
      for (const object of page.Contents ?? []) {
        const key = object.Key?.slice(this.prefix.length);
        if (key && STORAGE_KEY_PATTERN.test(key) && object.LastModified)
          yield { key, modifiedAt: object.LastModified };
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
}
