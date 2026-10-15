import test from "node:test";
import assert from "node:assert/strict";
import { extractPlannedTaskFocus } from "../staging/modules.mjs";

test("extracts the bounded plan detail generated for a specialist", () => {
  assert.equal(
    extractPlannedTaskFocus({ taskDetails: "Check auth boundaries and failure paths." }),
    "Check auth boundaries and failure paths."
  );
});

test("trims plan details and caps them at 1200 characters", () => {
  assert.equal(extractPlannedTaskFocus({ taskDetails: "  Focus on tests  " }), "Focus on tests");
  assert.equal(extractPlannedTaskFocus({ taskDetails: "x".repeat(1500) }).length, 1200);
});

test("returns an empty focus when stored payload has no valid plan details", () => {
  assert.equal(extractPlannedTaskFocus({}), "");
  assert.equal(extractPlannedTaskFocus(null), "");
  assert.equal(extractPlannedTaskFocus({ taskDetails: 123 }), "");
});
