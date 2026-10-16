import { INITIAL_PERMISSIONS } from "@/modules/identity/domain/access-catalog";
import {
  floorPlanId,
  normalizeFloorPlanBox,
  normalizeFloorPlanElementTarget,
  normalizeFloorPlanInput,
  type FloorPlanContext,
} from "../domain/floor-plan";
import type { FloorPlanStore } from "./floor-plan-store";

const READ = INITIAL_PERMISSIONS.spaceRead.key;
const MANAGE = INITIAL_PERMISSIONS.spaceManage.key;
type PlanInput = { name: unknown; width: unknown; height: unknown };
type BoxInput = { x: unknown; y: unknown; width: unknown; height: unknown };

// Spatial III (ADR 0020): a plan is configuration of its Space, so it reuses
// space.read and space.manage instead of adding permissions.
export class FloorPlanService {
  constructor(private readonly store: FloorPlanStore) {}

  list(input: FloorPlanContext & { spaceId: string }) {
    const spaceId = floorPlanId(input.spaceId);
    return this.store.run(input, READ, async (tx, keys) => ({
      plans: await tx.list(spaceId),
      canManage: keys.includes(MANAGE),
    }));
  }

  get(input: FloorPlanContext & { floorPlanId: string }) {
    const id = floorPlanId(input.floorPlanId);
    return this.store.run(input, READ, async (tx, keys) => ({
      ...(await tx.get(id)),
      canManage: keys.includes(MANAGE),
    }));
  }

  create(input: FloorPlanContext & { spaceId: string } & PlanInput) {
    const spaceId = floorPlanId(input.spaceId);
    const values = normalizeFloorPlanInput(input);
    return this.store.run(input, MANAGE, (tx) =>
      tx.create({ spaceId, ...values }),
    );
  }

  update(input: FloorPlanContext & { floorPlanId: string } & PlanInput) {
    const id = floorPlanId(input.floorPlanId);
    const values = normalizeFloorPlanInput(input);
    return this.store.run(input, MANAGE, (tx) => tx.update({ id, ...values }));
  }

  deactivate(input: FloorPlanContext & { floorPlanId: string }) {
    const id = floorPlanId(input.floorPlanId);
    return this.store.run(input, MANAGE, (tx) => tx.deactivate(id));
  }

  addElement(
    input: FloorPlanContext & {
      floorPlanId: string;
      kind: unknown;
      targetId?: unknown;
      label?: unknown;
    } & BoxInput,
  ) {
    const id = floorPlanId(input.floorPlanId);
    const target = normalizeFloorPlanElementTarget(input);
    const box = normalizeFloorPlanBox(input);
    return this.store.run(input, MANAGE, (tx) =>
      tx.addElement({ floorPlanId: id, ...target, ...box }),
    );
  }

  moveElement(
    input: FloorPlanContext & {
      floorPlanId: string;
      elementId: string;
    } & BoxInput,
  ) {
    const id = floorPlanId(input.floorPlanId);
    const elementId = floorPlanId(input.elementId);
    const box = normalizeFloorPlanBox(input);
    return this.store.run(input, MANAGE, (tx) =>
      tx.moveElement({ floorPlanId: id, elementId, ...box }),
    );
  }

  removeElement(
    input: FloorPlanContext & { floorPlanId: string; elementId: string },
  ) {
    const id = floorPlanId(input.floorPlanId);
    const elementId = floorPlanId(input.elementId);
    return this.store.run(input, MANAGE, (tx) =>
      tx.removeElement({ floorPlanId: id, elementId }),
    );
  }
}
