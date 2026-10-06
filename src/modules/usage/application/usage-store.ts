import type { PermissionKey } from "@/modules/identity/domain/access-catalog";
import type {
  UsageContext,
  UsageContextKind,
  UsageSource,
  ResourceUsage,
  UsageOption,
  UsageHistoryEntry,
} from "../domain/usage";
export interface UsageTransaction {
  options(context: UsageContext): Promise<UsageOption[]>;
  validate(
    context: UsageContext,
    kind: UsageContextKind,
    contextId: string,
    resourceId: string,
  ): Promise<{ spaceId: string; now: Date }>;
  start(
    context: UsageContext,
    kind: UsageContextKind,
    contextId: string,
    resourceId: string,
    target: { spaceId: string; now: Date },
    source: UsageSource,
  ): Promise<ResourceUsage>;
  finish(
    context: UsageContext,
    usageId: string,
    source: UsageSource,
  ): Promise<ResourceUsage>;
  mine(context: UsageContext): Promise<UsageHistoryEntry[]>;
  trace(
    context: UsageContext,
    resourceId: string,
  ): Promise<UsageHistoryEntry[]>;
}
export interface UsageStore {
  run<T>(
    context: UsageContext,
    permission: PermissionKey,
    operation: (tx: UsageTransaction) => Promise<T>,
  ): Promise<T>;
}
