import assert from "node:assert/strict";
import test from "node:test";
import {
  balanceAfter,
  quantityInThousandths,
  formatQuantity,
  normalizeItem,
  validateMovement,
  InventoryError,
} from "../src/modules/inventory/domain/inventory";
test("exact decimal quantities, boundaries and piece semantics", () => {
  assert.equal(balanceAfter("0.100", "entry", "0.200"), "0.300");
  assert.equal(balanceAfter("1.000", "consumption", "0.001"), "0.999");
  assert.equal(
    formatQuantity(quantityInThousandths("999999999999999.999")),
    "999999999999999.999",
  );
  for (const input of [
    "NaN",
    "Infinity",
    "-1",
    "1e3",
    "01",
    "1.0001",
    "1000000000000000",
    "",
    " 1",
  ])
    assert.throws(() => quantityInThousandths(input), InventoryError);
  assert.throws(() => quantityInThousandths("0.5", "piece"), InventoryError);
  assert.throws(
    () => balanceAfter("0.100", "loss", "0.101"),
    (error) =>
      error instanceof InventoryError && error.code === "insufficient-stock",
  );
  assert.throws(
    () => balanceAfter("999999999999999.999", "entry", "0.001"),
    InventoryError,
  );
});
test("item classification and movement validation preserve reusable tools", () => {
  assert.deepEqual(
    normalizeItem({ name: " Oil ", type: "consumable", unit: "litre" }),
    { name: "Oil", type: "consumable", unit: "litre" },
  );
  for (const input of [
    { name: "", type: "consumable", unit: "piece" },
    { name: "Tool", type: "reusable_tool", unit: "litre" },
    { name: "Asset", type: "asset", unit: "piece" },
  ])
    assert.throws(() => normalizeItem(input), InventoryError);
  const input = {
    type: "entry",
    quantity: "2",
    notes: " Purchase ",
    source: "WEB",
  };
  const item = { type: "reusable_tool", unit: "piece" } as const;
  assert.equal(validateMovement(input, item).notes, "Purchase");
  for (const change of [
    { type: "consumption" },
    { type: "return" },
    { quantity: "0" },
    { quantity: "0.5" },
    { notes: " " },
    { source: "UNKNOWN" },
  ])
    assert.throws(
      () => validateMovement({ ...input, ...change }, item),
      InventoryError,
    );
});
