import { isSpatialId } from "./spatial-id";

export type FloorPlanErrorCode =
  "input" | "not-found" | "reference" | "bounds" | "duplicate";
export class FloorPlanError extends Error {
  constructor(readonly code: FloorPlanErrorCode) {
    super(`Floor plan ${code}.`);
    this.name = "FloorPlanError";
  }
}

// Plans use an abstract grid of cells, not metres: enough to place resources
// like seats without modelling the building (SRS §12.4).
export const FLOOR_PLAN_MAX_CELLS = 100;
export const FLOOR_PLAN_ELEMENT_KINDS = [
  "resource",
  "location",
  "label",
] as const;
export type FloorPlanElementKind = (typeof FLOOR_PLAN_ELEMENT_KINDS)[number];

export type FloorPlanContext = { actorUserId: string; laboratoryId: string };
export type FloorPlanSize = { width: number; height: number };
export type FloorPlan = FloorPlanSize & {
  id: string;
  spaceId: string;
  name: string;
};
export type FloorPlanBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type FloorPlanElementTarget =
  | { kind: "resource"; resourceId: string; locationId: null; label: null }
  | { kind: "location"; resourceId: null; locationId: string; label: null }
  | { kind: "label"; resourceId: null; locationId: null; label: string };
export type FloorPlanElement = FloorPlanBox &
  FloorPlanElementTarget & { id: string; floorPlanId: string };

export function floorPlanId(value: unknown) {
  if (typeof value !== "string" || !isSpatialId(value))
    throw new FloorPlanError("not-found");
  return value.toLowerCase();
}

function integer(value: unknown, min: number, max: number) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d{1,3}$/.test(value.trim())
        ? Number(value)
        : NaN;
  if (!Number.isInteger(number) || number < min || number > max)
    throw new FloorPlanError("input");
  return number;
}

function text(value: unknown, max: number) {
  if (typeof value !== "string") throw new FloorPlanError("input");
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) throw new FloorPlanError("input");
  return trimmed;
}

export function normalizeFloorPlanInput(input: {
  name: unknown;
  width: unknown;
  height: unknown;
}) {
  return {
    name: text(input.name, 120),
    width: integer(input.width, 1, FLOOR_PLAN_MAX_CELLS),
    height: integer(input.height, 1, FLOOR_PLAN_MAX_CELLS),
  };
}

export function normalizeFloorPlanBox(input: {
  x: unknown;
  y: unknown;
  width: unknown;
  height: unknown;
}): FloorPlanBox {
  return {
    x: integer(input.x, 0, FLOOR_PLAN_MAX_CELLS - 1),
    y: integer(input.y, 0, FLOOR_PLAN_MAX_CELLS - 1),
    width: integer(input.width, 1, FLOOR_PLAN_MAX_CELLS),
    height: integer(input.height, 1, FLOOR_PLAN_MAX_CELLS),
  };
}

export function normalizeFloorPlanElementTarget(input: {
  kind: unknown;
  targetId?: unknown;
  label?: unknown;
}): FloorPlanElementTarget {
  if (input.kind === "label")
    return {
      kind: "label",
      resourceId: null,
      locationId: null,
      label: text(input.label, 80),
    };
  if (input.kind !== "resource" && input.kind !== "location")
    throw new FloorPlanError("input");
  if (typeof input.targetId !== "string" || !isSpatialId(input.targetId))
    throw new FloorPlanError("input");
  const id = input.targetId.toLowerCase();
  return input.kind === "resource"
    ? { kind: "resource", resourceId: id, locationId: null, label: null }
    : { kind: "location", resourceId: null, locationId: id, label: null };
}

// Checked by services and again by a PostgreSQL trigger under the plan's lock.
export function fitsFloorPlan(box: FloorPlanBox, plan: FloorPlanSize) {
  return box.x + box.width <= plan.width && box.y + box.height <= plan.height;
}

export function requireFitsFloorPlan(box: FloorPlanBox, plan: FloorPlanSize) {
  if (!fitsFloorPlan(box, plan)) throw new FloorPlanError("bounds");
}
