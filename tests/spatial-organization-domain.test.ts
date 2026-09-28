import assert from "node:assert/strict";
import test from "node:test";
import {
  LocationInputError,
  normalizeLocationInput,
} from "../src/modules/spatial/domain/location";
import {
  normalizeResourceInput,
  ResourceInputError,
} from "../src/modules/spatial/domain/resource";

const uuid = "11111111-1111-4111-8111-111111111111";

test("normalizes minimal location and resource input", () => {
  assert.deepEqual(normalizeLocationInput({ name: "  Área de tornos  " }), {
    name: "Área de tornos",
    parentId: null,
  });
  assert.deepEqual(
    normalizeLocationInput({ name: "Zona norte", parentId: ` ${uuid} ` }),
    { name: "Zona norte", parentId: uuid },
  );
  assert.deepEqual(normalizeResourceInput({ name: "  Torno 1  " }), {
    name: "Torno 1",
    locationId: null,
  });
});

test("rejects blank names and malformed relation ids", () => {
  assert.throws(
    () => normalizeLocationInput({ name: "  " }),
    LocationInputError,
  );
  assert.throws(
    () => normalizeLocationInput({ name: "Zona", parentId: "not-a-uuid" }),
    LocationInputError,
  );
  assert.throws(() => normalizeResourceInput({ name: "" }), ResourceInputError);
  assert.throws(
    () => normalizeResourceInput({ name: "Torno", locationId: "invalid" }),
    ResourceInputError,
  );
});
