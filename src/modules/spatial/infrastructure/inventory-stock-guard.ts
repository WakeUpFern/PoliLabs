import { postgresError } from "@/infrastructure/database/postgres-error";

// Translate only the invariant introduced by Inventory I; do not hide unrelated DB failures.
export function isInventoryStockGuard(error: unknown): boolean {
  const pg = postgresError(error);
  return (
    pg.code === "23514" &&
    Boolean(pg.message?.includes("location or space has inventory stock"))
  );
}
