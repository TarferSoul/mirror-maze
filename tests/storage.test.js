import test from "node:test";
import assert from "node:assert/strict";
import { levels } from "../src/levels.js";
import {
  emptyProgress,
  readProgress,
  writeProgress,
  unlockedThrough,
  recordWin,
} from "../src/storage.js";
const storage = (value) => ({ getItem: () => value, setItem: () => {} });
const record = { moves: 12, shifts: 2, hints: 0, stars: 3 };

test("missing, malformed, old and unavailable saves are safe", () => {
  for (const value of [null, "invalid", "{}", '{"version":2}', "null"])
    assert.deepEqual(readProgress(storage(value), levels), emptyProgress());
  assert.deepEqual(readProgress(null, levels), emptyProgress());
  assert.equal(writeProgress(null, emptyProgress()), false);
  assert.equal(
    writeProgress(
      {
        setItem() {
          throw new Error("Quota exceeded");
        },
      },
      emptyProgress(),
    ),
    false,
  );
});

test("validated records and preferences round-trip", () => {
  const progress = {
    ...emptyProgress(),
    started: true,
    sound: true,
    selected: 1,
    records: { [levels[0].id]: record },
  };
  assert.deepEqual(
    readProgress(storage(JSON.stringify(progress)), levels),
    progress,
  );
  assert.equal(unlockedThrough(progress, levels), 1);
});

test("malformed records cannot unlock levels and selection is clamped", () => {
  const progress = {
    version: 1,
    selected: 99,
    records: {
      [levels[0].id]: { ...record, moves: -1 },
      [levels[4].id]: record,
    },
  };
  const restored = readProgress(storage(JSON.stringify(progress)), levels);
  assert.equal(restored.selected, 0);
  assert.equal(restored.records[levels[0].id], undefined);
  assert.equal(unlockedThrough(restored, levels), 0);
});

test("best total score is preserved and fewer hints break ties", () => {
  const progress = emptyProgress();
  recordWin(progress, levels[0], { ...record, hints: 2 });
  recordWin(progress, levels[0], { ...record, moves: 20 });
  assert.equal(progress.records[levels[0].id].moves, 12);
  recordWin(progress, levels[0], record);
  assert.equal(progress.records[levels[0].id].hints, 0);
});
