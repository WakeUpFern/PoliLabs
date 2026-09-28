import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import type { LocationDetails } from "../domain/location";
import type { ResourceDetails } from "../domain/resource";

export interface LocationReader {
  listActiveLocations(input: {
    laboratoryId: string;
    spaceId: string;
  }): Promise<readonly LocationDetails[]>;
}

export interface ResourceReader {
  listActiveResources(input: {
    laboratoryId: string;
    spaceId: string;
  }): Promise<readonly ResourceDetails[]>;
}

export type LocationWriteResult =
  | { status: "created"; location: LocationDetails }
  | { status: "updated"; location: LocationDetails }
  | { status: "deactivated" }
  | { status: "not-found" | "unauthorized" | "invalid-parent" | "cycle" }
  | { status: "has-active-dependents" };

export type ResourceWriteResult =
  | { status: "created"; resource: ResourceDetails }
  | { status: "updated"; resource: ResourceDetails }
  | { status: "deactivated" }
  | { status: "not-found" | "unauthorized" | "invalid-location" };

type AuthorizedWrite = {
  actorUserId: string;
  laboratoryId: string;
  spaceId: string;
  requiredPermission: PermissionKey;
};

export interface LocationWriter {
  createLocation(
    input: AuthorizedWrite & { name: string; parentId: string | null },
  ): Promise<LocationWriteResult>;
  updateLocation(
    input: AuthorizedWrite & {
      locationId: string;
      name: string;
      parentId: string | null;
    },
  ): Promise<LocationWriteResult>;
  deactivateLocation(
    input: AuthorizedWrite & { locationId: string },
  ): Promise<LocationWriteResult>;
}

export interface ResourceWriter {
  createResource(
    input: AuthorizedWrite & { name: string; locationId: string | null },
  ): Promise<ResourceWriteResult>;
  updateResource(
    input: AuthorizedWrite & {
      resourceId: string;
      name: string;
      locationId: string | null;
    },
  ): Promise<ResourceWriteResult>;
  deactivateResource(
    input: AuthorizedWrite & { resourceId: string },
  ): Promise<ResourceWriteResult>;
}
