import { isSpatialId } from "./spatial-id";

export class ResourceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceInputError";
  }
}

export class ResourceNotFoundError extends Error {
  constructor() {
    super("Resource not found.");
    this.name = "ResourceNotFoundError";
  }
}

export class InvalidResourceLocationError extends Error {
  constructor() {
    super("The location must be active and belong to the same space.");
    this.name = "InvalidResourceLocationError";
  }
}

// Changed only through Maintenance log entries; isActive is catalog membership.
export const OPERATIONAL_STATUSES = [
  "operational",
  "in_maintenance",
  "out_of_service",
] as const;
export type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number];

export type ResourceDetails = {
  id: string;
  spaceId: string;
  locationId: string | null;
  name: string;
  isActive: boolean;
  operationalStatus: OperationalStatus;
};

export function normalizeResourceInput(input: {
  name: string;
  locationId?: string | null;
}) {
  const name = input.name.trim();
  const locationId = input.locationId?.trim() || null;
  if (!name) throw new ResourceInputError("Resource name is required.");
  if (locationId && !isSpatialId(locationId))
    throw new ResourceInputError("Resource location id is invalid.");
  return { name, locationId };
}
