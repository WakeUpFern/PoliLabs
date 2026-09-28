import type { SpaceDetails } from "../domain/space";

export interface SpaceReader {
  listActive(laboratoryId: string): Promise<readonly SpaceDetails[]>;
  findActiveBySlug(input: {
    laboratoryId: string;
    slug: string;
  }): Promise<SpaceDetails | null>;
}

export type SpaceWriteResult =
  | { status: "created"; space: SpaceDetails }
  | { status: "updated"; space: SpaceDetails }
  | { status: "deactivated" }
  | { status: "duplicate" }
  | { status: "not-found" }
  | { status: "unauthorized" };

export interface SpaceWriter {
  create(input: {
    actorUserId: string;
    laboratoryId: string;
    name: string;
    slug: string;
    capacity: number | null;
  }): Promise<SpaceWriteResult>;
  update(input: {
    actorUserId: string;
    laboratoryId: string;
    currentSlug: string;
    name: string;
    slug: string;
    capacity: number | null;
  }): Promise<SpaceWriteResult>;
  deactivate(input: {
    actorUserId: string;
    laboratoryId: string;
    slug: string;
  }): Promise<SpaceWriteResult>;
}
