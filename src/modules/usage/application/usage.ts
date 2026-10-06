import {
  usageId,
  usageKind,
  usageSource,
  type UsageContext,
} from "../domain/usage";
import type { UsageStore } from "./usage-store";
export class UsageService {
  constructor(private readonly store: UsageStore) {}
  options(input: UsageContext) {
    return this.store.run(input, "usage.record", (tx) => tx.options(input));
  }
  mine(input: UsageContext) {
    return this.store.run(input, "usage.read", (tx) => tx.mine(input));
  }
  trace(input: UsageContext & { resourceId: string }) {
    const id = usageId(input.resourceId);
    return this.store.run(input, "usage.trace", (tx) => tx.trace(input, id));
  }
  start(
    input: UsageContext & {
      kind: string;
      contextId: string;
      resourceId: string;
      source: string;
    },
  ) {
    const kind = usageKind(input.kind),
      contextId = usageId(input.contextId),
      resourceId = usageId(input.resourceId),
      source = usageSource(input.source);
    return this.store.run(input, "usage.record", async (tx) => {
      const target = await tx.validate(input, kind, contextId, resourceId);
      return tx.start(input, kind, contextId, resourceId, target, source);
    });
  }
  finish(input: UsageContext & { usageId: string; source: string }) {
    const id = usageId(input.usageId),
      source = usageSource(input.source);
    return this.store.run(input, "usage.record", (tx) =>
      tx.finish(input, id, source),
    );
  }
}
