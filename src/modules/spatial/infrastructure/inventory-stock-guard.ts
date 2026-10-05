// Translate only the invariant introduced by Inventory I; do not hide unrelated DB failures.
export function isInventoryStockGuard(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (
    "code" in error &&
    "message" in error &&
    error.code === "23514" &&
    typeof error.message === "string" &&
    error.message.includes("location or space has inventory stock")
  )
    return true;
  return "cause" in error && isInventoryStockGuard(error.cause);
}
