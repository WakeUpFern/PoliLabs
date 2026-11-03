import { isId } from "@/shared/validation";

export class LocationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocationInputError";
  }
}

export class LocationNotFoundError extends Error {
  constructor() {
    super("Location not found.");
    this.name = "LocationNotFoundError";
  }
}

export class InvalidLocationParentError extends Error {
  constructor() {
    super("The parent location must be active and belong to the same space.");
    this.name = "InvalidLocationParentError";
  }
}

export class LocationCycleError extends Error {
  constructor() {
    super("The location hierarchy cannot contain a cycle.");
    this.name = "LocationCycleError";
  }
}

export class LocationHasActiveDependentsError extends Error {
  constructor() {
    super(
      "The location still has active children, resources or inventory stock.",
    );
    this.name = "LocationHasActiveDependentsError";
  }
}

export type LocationDetails = {
  id: string;
  spaceId: string;
  parentId: string | null;
  name: string;
  isActive: boolean;
};

export function normalizeLocationInput(input: {
  name: string;
  parentId?: string | null;
}) {
  const name = input.name.trim();
  const parentId = input.parentId?.trim() || null;
  if (!name) throw new LocationInputError("Location name is required.");
  if (parentId && !isId(parentId))
    throw new LocationInputError("Parent location id is invalid.");
  return { name, parentId };
}

type PathNode = { id: string; name: string; parentId: string | null };
// Names from the root down to this location; a corrupt cycle stops the walk.
export function locationPath<T extends PathNode>(
  location: T,
  byId: ReadonlyMap<string, T>,
) {
  const names: string[] = [];
  const visited = new Set<string>();
  for (
    let current: T | undefined = location;
    current && !visited.has(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined
  ) {
    visited.add(current.id);
    names.unshift(current.name);
  }
  return names;
}
