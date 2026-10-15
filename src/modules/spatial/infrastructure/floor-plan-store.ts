import { and, asc, eq, or, type Column } from "drizzle-orm";
import {
  authorizeLocked,
  type OperationDatabase,
  type OperationTransaction,
} from "@/modules/identity/infrastructure/authorize-locked";
import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import type {
  FloorPlanStore,
  FloorPlanTransaction,
} from "../application/floor-plan-store";
import {
  fitsFloorPlan,
  floorPlanId,
  FloorPlanError,
  requireFitsFloorPlan,
  type FloorPlan,
  type FloorPlanContext,
  type FloorPlanElement,
} from "../domain/floor-plan";
import {
  floorPlanElements,
  floorPlans,
  locations,
  resources,
  spaces,
} from "./spatial-schema";

function postgresError(error: unknown): { code?: string; message?: string } {
  if (!error || typeof error !== "object") return {};
  if ("code" in error && typeof error.code === "string")
    return {
      code: error.code,
      message: "message" in error ? String(error.message) : undefined,
    };
  return "cause" in error ? postgresError(error.cause) : {};
}

const planSelection = {
  id: floorPlans.id,
  spaceId: floorPlans.spaceId,
  name: floorPlans.name,
  width: floorPlans.width,
  height: floorPlans.height,
};
const elementSelection = {
  id: floorPlanElements.id,
  floorPlanId: floorPlanElements.floorPlanId,
  kind: floorPlanElements.kind,
  resourceId: floorPlanElements.resourceId,
  locationId: floorPlanElements.locationId,
  label: floorPlanElements.label,
  x: floorPlanElements.x,
  y: floorPlanElements.y,
  width: floorPlanElements.width,
  height: floorPlanElements.height,
};
type ElementRow = {
  [
    K in keyof typeof elementSelection
  ]: (typeof floorPlanElements.$inferSelect)[K];
};
const toElement = (row: ElementRow) => row as FloorPlanElement;

class DrizzleFloorPlanTransaction implements FloorPlanTransaction {
  constructor(
    private readonly tx: OperationTransaction,
    private readonly context: FloorPlanContext,
  ) {}

  private activeSpace(spaceId: string | Column) {
    return and(
      eq(spaces.id, spaceId),
      eq(spaces.laboratoryId, this.context.laboratoryId),
      eq(spaces.isActive, true),
    );
  }

  // Plans are reached only through an active Space of the authorized lab.
  private async plan(
    planId: string,
    lock?: "share" | "update",
  ): Promise<FloorPlan> {
    const query = this.tx
      .select(planSelection)
      .from(floorPlans)
      .innerJoin(spaces, this.activeSpace(floorPlans.spaceId))
      .where(and(eq(floorPlans.id, planId), eq(floorPlans.isActive, true)));
    const [plan] = await (lock ? query.for(lock, { of: floorPlans }) : query);
    if (!plan) throw new FloorPlanError("not-found");
    return plan;
  }

  private async elements(planId: string) {
    // Elements whose resource or location left the catalog stay stored but hidden.
    const rows = await this.tx
      .select(elementSelection)
      .from(floorPlanElements)
      .leftJoin(resources, eq(resources.id, floorPlanElements.resourceId))
      .leftJoin(locations, eq(locations.id, floorPlanElements.locationId))
      .where(
        and(
          eq(floorPlanElements.floorPlanId, planId),
          or(
            eq(floorPlanElements.kind, "label"),
            eq(resources.isActive, true),
            eq(locations.isActive, true),
          ),
        ),
      )
      .orderBy(
        asc(floorPlanElements.y),
        asc(floorPlanElements.x),
        asc(floorPlanElements.id),
      );
    return rows.map(toElement);
  }

  async list(spaceId: string) {
    const [space] = await this.tx
      .select({ id: spaces.id })
      .from(spaces)
      .where(this.activeSpace(spaceId));
    if (!space) throw new FloorPlanError("not-found");
    return this.tx
      .select(planSelection)
      .from(floorPlans)
      .where(
        and(eq(floorPlans.spaceId, spaceId), eq(floorPlans.isActive, true)),
      )
      .orderBy(asc(floorPlans.name), asc(floorPlans.id));
  }

  async get(planId: string) {
    const plan = await this.plan(planId);
    return { plan, elements: await this.elements(plan.id) };
  }

  async create(input: Omit<FloorPlan, "id">) {
    const [space] = await this.tx
      .select({ id: spaces.id })
      .from(spaces)
      .where(this.activeSpace(input.spaceId))
      .for("share");
    if (!space) throw new FloorPlanError("not-found");
    const [plan] = await this.tx
      .insert(floorPlans)
      .values(input)
      .returning(planSelection);
    return plan;
  }

  async update(input: Omit<FloorPlan, "spaceId">) {
    const current = await this.plan(input.id, "update");
    const placed = await this.tx
      .select(elementSelection)
      .from(floorPlanElements)
      .where(eq(floorPlanElements.floorPlanId, current.id));
    // Hidden elements count too: the database keeps every stored box in bounds.
    if (placed.some((element) => !fitsFloorPlan(element, input)))
      throw new FloorPlanError("bounds");
    const [plan] = await this.tx
      .update(floorPlans)
      .set({
        name: input.name,
        width: input.width,
        height: input.height,
        updatedAt: new Date(),
      })
      .where(eq(floorPlans.id, current.id))
      .returning(planSelection);
    return plan;
  }

  async deactivate(planId: string) {
    const plan = await this.plan(planId, "update");
    await this.tx
      .update(floorPlans)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(floorPlans.id, plan.id));
  }

  async addElement(input: Parameters<FloorPlanTransaction["addElement"]>[0]) {
    const plan = await this.plan(input.floorPlanId, "share");
    requireFitsFloorPlan(input, plan);
    if (input.kind === "resource") {
      const [resource] = await this.tx
        .select({ id: resources.id })
        .from(resources)
        .where(
          and(
            eq(resources.id, input.resourceId),
            eq(resources.spaceId, plan.spaceId),
            eq(resources.isActive, true),
          ),
        )
        .for("share");
      if (!resource) throw new FloorPlanError("reference");
    }
    if (input.kind === "location") {
      const [location] = await this.tx
        .select({ id: locations.id })
        .from(locations)
        .where(
          and(
            eq(locations.id, input.locationId),
            eq(locations.spaceId, plan.spaceId),
            eq(locations.isActive, true),
          ),
        )
        .for("share");
      if (!location) throw new FloorPlanError("reference");
    }
    const [element] = await this.tx
      .insert(floorPlanElements)
      .values({ ...input, spaceId: plan.spaceId })
      .returning(elementSelection);
    return toElement(element);
  }

  async moveElement(input: Parameters<FloorPlanTransaction["moveElement"]>[0]) {
    const plan = await this.plan(input.floorPlanId, "share");
    requireFitsFloorPlan(input, plan);
    const [element] = await this.tx
      .update(floorPlanElements)
      .set({
        x: input.x,
        y: input.y,
        width: input.width,
        height: input.height,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(floorPlanElements.id, input.elementId),
          eq(floorPlanElements.floorPlanId, plan.id),
        ),
      )
      .returning(elementSelection);
    if (!element) throw new FloorPlanError("not-found");
    return toElement(element);
  }

  async removeElement(input: { floorPlanId: string; elementId: string }) {
    const plan = await this.plan(input.floorPlanId, "share");
    // Elements are layout configuration without history; reservations and
    // catalog rows they reference are untouched.
    const removed = await this.tx
      .delete(floorPlanElements)
      .where(
        and(
          eq(floorPlanElements.id, input.elementId),
          eq(floorPlanElements.floorPlanId, plan.id),
        ),
      )
      .returning({ id: floorPlanElements.id });
    if (!removed.length) throw new FloorPlanError("not-found");
  }
}

export class DrizzleFloorPlanStore implements FloorPlanStore {
  constructor(private readonly db: OperationDatabase) {}

  async run<T>(
    context: FloorPlanContext,
    permission: PermissionKey,
    operation: (
      tx: FloorPlanTransaction,
      permissionKeys: readonly string[],
    ) => Promise<T>,
  ): Promise<T> {
    floorPlanId(context.actorUserId);
    floorPlanId(context.laboratoryId);
    try {
      return await this.db.transaction(
        async (tx) => {
          const grant = await authorizeLocked(tx, context, permission);
          return operation(
            new DrizzleFloorPlanTransaction(tx, context),
            grant.permissionKeys,
          );
        },
        { isolationLevel: "read committed" },
      );
    } catch (error) {
      const pg = postgresError(error);
      if (pg.code === "23505") throw new FloorPlanError("duplicate");
      if (pg.code === "23503") throw new FloorPlanError("reference");
      if (pg.code === "23514")
        throw new FloorPlanError(
          pg.message?.includes("out of bounds") ? "bounds" : "input",
        );
      throw error;
    }
  }
}
