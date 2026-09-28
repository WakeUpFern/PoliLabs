const SPACE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class SpaceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpaceInputError";
  }
}

export class SpaceNotFoundError extends Error {
  constructor() {
    super("Space not found.");
    this.name = "SpaceNotFoundError";
  }
}

export class DuplicateSpaceSlugError extends Error {
  constructor() {
    super("A space with this slug already exists in the laboratory.");
    this.name = "DuplicateSpaceSlugError";
  }
}

export type SpaceDetails = {
  id: string;
  laboratoryId: string;
  slug: string;
  name: string;
  capacity: number | null;
  isActive: boolean;
};

export function normalizeSpaceInput(input: {
  name: string;
  slug: string;
  capacity?: number | null;
}) {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  const capacity = input.capacity ?? null;

  if (!name) throw new SpaceInputError("Space name is required.");
  if (!SPACE_SLUG_PATTERN.test(slug))
    throw new SpaceInputError(
      "Space slug must contain lowercase letters, numbers and hyphens.",
    );
  if (capacity !== null && (!Number.isSafeInteger(capacity) || capacity < 1))
    throw new SpaceInputError("Space capacity must be a positive integer.");

  return { name, slug, capacity };
}
