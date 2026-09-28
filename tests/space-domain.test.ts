import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSpaceInput,
  SpaceInputError,
} from "../src/modules/spatial/domain/space";

test("normalizes valid space input", () => {
  assert.deepEqual(
    normalizeSpaceInput({
      name: "  Laboratorio flexible  ",
      slug: "  LAB-FLEXIBLE  ",
      capacity: 24,
    }),
    {
      name: "Laboratorio flexible",
      slug: "lab-flexible",
      capacity: 24,
    },
  );
});

test("rejects invalid space catalog values", () => {
  for (const input of [
    { name: "", slug: "espacio", capacity: null },
    { name: "Espacio", slug: "espacio inválido", capacity: null },
    { name: "Espacio", slug: "espacio", capacity: 0 },
    { name: "Espacio", slug: "espacio", capacity: 2.5 },
  ]) {
    assert.throws(() => normalizeSpaceInput(input), SpaceInputError);
  }
});
