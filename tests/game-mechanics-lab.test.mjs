import test from "node:test";
import assert from "node:assert/strict";
import {
  createObservationRecord,
  summarizeObservations,
  predictNextUiState,
  detectRepeatedSequences,
  authorizeObservationAction
} from "../central-agent/architecture/game-mechanics-lab.mjs";

test("records only aggregate, visible, non-identifying observations", () => {
  const record = createObservationRecord({
    timestamp: "2026-11-08T10:00:00.000Z",
    roundId: "R-12",
    uiState: "COUNTDOWN",
    visiblePlayerCount: 7,
    visibleLabel: "NEXT GAME SOON",
    playerName: "must-not-be-kept",
    accountId: "must-not-be-kept"
  });

  assert.deepEqual(record, {
    timestamp: "2026-11-08T10:00:00.000Z",
    roundId: "R-12",
    uiState: "COUNTDOWN",
    visiblePlayerCount: 7,
    visibleLabel: "NEXT GAME SOON"
  });
  assert.equal("playerName" in record, false);
  assert.equal("accountId" in record, false);
});

test("rejects invalid states and invalid aggregate player counts", () => {
  assert.throws(() => createObservationRecord({ uiState: "BET_NOW" }), /INVALID_UI_STATE/);
  assert.throws(() => createObservationRecord({ uiState: "COUNTDOWN", visiblePlayerCount: -1 }), /INVALID_PLAYER_COUNT/);
});

test("summarizes observed UI states without converting them into outcome odds", () => {
  const rows = ["COUNTDOWN", "COUNTDOWN", "SPINNING", "RESULT", "COUNTDOWN"].map((uiState, i) =>
    createObservationRecord({ timestamp: new Date(Date.UTC(2026, 10, 8, 10, 0, i)).toISOString(), uiState })
  );
  const summary = summarizeObservations(rows);
  assert.equal(summary.sampleSize, 5);
  assert.equal(summary.stateCounts.COUNTDOWN, 3);
  assert.equal(summary.stateShares.COUNTDOWN, 0.6);
  assert.equal(summary.outcomePrediction, null);
});

test("predicts the next UI state from observed transitions only", () => {
  const rows = ["COUNTDOWN", "SPINNING", "RESULT", "COUNTDOWN", "SPINNING", "RESULT", "COUNTDOWN"].map((uiState, i) =>
    createObservationRecord({ timestamp: new Date(Date.UTC(2026, 10, 8, 10, 0, i)).toISOString(), uiState })
  );
  const prediction = predictNextUiState(rows);
  assert.equal(prediction.state, "SPINNING");
  assert.equal(prediction.basis, "observed-ui-transitions");
  assert.equal(prediction.outcomePrediction, null);
});

test("detects repeated visible state sequences with explicit window length", () => {
  const rows = ["COUNTDOWN", "SPINNING", "RESULT", "COUNTDOWN", "SPINNING", "RESULT"].map((uiState, i) =>
    createObservationRecord({ timestamp: new Date(Date.UTC(2026, 10, 8, 10, 0, i)).toISOString(), uiState })
  );
  const repeats = detectRepeatedSequences(rows, 3);
  const target = repeats.find((entry) => entry.sequence.join(">") === "COUNTDOWN>SPINNING>RESULT");
  assert.equal(target.occurrences, 2);
});

test("allows only explicitly listed read-only research actions", () => {
  assert.equal(authorizeObservationAction("read_public_page", { method: "GET" }).allowed, true);
  assert.equal(authorizeObservationAction("read_public_page", { method: "POST" }).allowed, false);
  assert.equal(authorizeObservationAction("capture_visible_frame", { method: "LOCAL" }).allowed, true);
  assert.equal(authorizeObservationAction("place_bet", { method: "POST" }).allowed, false);
  assert.equal(authorizeObservationAction("change_game_state", { method: "POST" }).allowed, false);
});
