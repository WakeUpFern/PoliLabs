import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import type {
  ObjectStorage,
  StoredObject,
} from "../application/object-storage";
import { STORAGE_KEY_PATTERN } from "../domain/documents";
const TEMPORARY = ".tmp";
const TEMPORARY_KEY = /^\.tmp\/[0-9a-f]{32}$/;
// Development adapter. Objects live outside public/ and are only served by
// the authorized download route.
export class LocalDiskObjectStorage implements ObjectStorage {
  private readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  private path(key: string) {
    if (!STORAGE_KEY_PATTERN.test(key) && !TEMPORARY_KEY.test(key))
      throw new Error("Invalid object key.");
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep))
      throw new Error("Invalid object key.");
    return path;
  }
  async put(key: string, bytes: Uint8Array) {
    const target = this.path(key);
    const temporary = this.path(
      `${TEMPORARY}/${randomUUID().replaceAll("-", "")}`,
    );
    await mkdir(dirname(temporary), { recursive: true });
    await mkdir(dirname(target), { recursive: true });
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      // Atomic on the same filesystem: readers never see a partial object.
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
  async get(key: string) {
    const path = this.path(key);
    try {
      if (!(await stat(path)).isFile()) return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    return Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
  }
  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }
  async *list(): AsyncIterable<StoredObject> {
    const walk = async function* (
      directory: string,
      prefix: string,
    ): AsyncGenerator<{ key: string; path: string }> {
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      for (const entry of entries) {
        const key = prefix ? `${prefix}/${entry.name}` : entry.name;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) yield* walk(path, key);
        else if (entry.isFile()) yield { key, path };
      }
    };
    for await (const { key, path } of walk(this.root, ""))
      if (STORAGE_KEY_PATTERN.test(key) || TEMPORARY_KEY.test(key))
        yield { key, modifiedAt: (await stat(path)).mtime };
  }
}
