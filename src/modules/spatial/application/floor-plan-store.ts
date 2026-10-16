import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import type {
  FloorPlan,
  FloorPlanBox,
  FloorPlanContext,
  FloorPlanElement,
  FloorPlanElementTarget,
} from "../domain/floor-plan";

export interface FloorPlanTransaction {
  list(spaceId: string): Promise<FloorPlan[]>;
  get(
    planId: string,
  ): Promise<{ plan: FloorPlan; elements: FloorPlanElement[] }>;
  create(input: Omit<FloorPlan, "id">): Promise<FloorPlan>;
  update(input: Omit<FloorPlan, "spaceId">): Promise<FloorPlan>;
  deactivate(planId: string): Promise<void>;
  addElement(
    input: { floorPlanId: string } & FloorPlanBox & FloorPlanElementTarget,
  ): Promise<FloorPlanElement>;
  moveElement(
    input: { floorPlanId: string; elementId: string } & FloorPlanBox,
  ): Promise<FloorPlanElement>;
  removeElement(input: {
    floorPlanId: string;
    elementId: string;
  }): Promise<void>;
}

export interface FloorPlanStore {
  run<T>(
    context: FloorPlanContext,
    permission: PermissionKey,
    operation: (
      tx: FloorPlanTransaction,
      permissionKeys: readonly string[],
    ) => Promise<T>,
  ): Promise<T>;
}
