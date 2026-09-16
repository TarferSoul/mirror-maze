import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIONS,
  defineLevel,
  initialState,
  transition,
  solve,
  stateKey,
  starsFor,
} from "../src/engine.js";
import { levels } from "../src/levels.js";

const fixture = defineLevel({
  id: "rules",
  start: { x: 1, y: 1 },
  maps: [
    ["#######", "#.k.AE#", "#.....#", "#######"],
    ["#######", "#..a..#", "#..bB.#", "#######"],
  ],
});
function play(level, actions, start = initialState(level)) {
  return actions.reduce((state, action) => {
    const result = transition(level, state, action);
    assert.ok(result.changed, `Rejected action: ${action}`);
    return result.state;
  }, start);
}

test("collisions and invalid actions never change the state or counters", () => {
  const state = initialState(fixture);
  for (const action of ["up", "left", "teleport"]) {
    const result = transition(fixture, state, action);
    assert.equal(result.changed, false);
    assert.equal(result.state, state);
  }
  assert.equal(transition(fixture, { ...state, y: -1 }, "up").changed, false);
});

test("keys persist across worlds and can only be collected once", () => {
  const state = play(fixture, ["right", "shift", "shift", "left", "right"]);
  assert.equal(state.keys, 1);
  assert.equal(state.moves, 3);
  assert.equal(state.shifts, 2);
});

test("switching onto a key collects it", () => {
  const state = play(fixture, ["shift", "right", "shift"]);
  assert.equal(state.keys, 1);
});

test("plates permanently open matching gates across worlds", () => {
  const start = { ...initialState(fixture), x: 3 };
  assert.equal(transition(fixture, start, "right").reason, "gate");
  const state = play(fixture, ["shift", "shift", "right"], start);
  assert.equal(state.switches, 1);
  assert.equal(state.x, 4);
});

test("B gate requires B, independently of A", () => {
  const start = { ...initialState(fixture), world: 1, x: 4, y: 1, switches: 1 };
  assert.equal(transition(fixture, start, "down").reason, "gate");
  const state = play(fixture, ["left", "down", "right"], start);
  assert.equal(state.switches, 3);
  assert.equal(state.y, 2);
});

test("switching into walls or unopened gates is rejected", () => {
  const state = { ...initialState(fixture), world: 1, x: 4 };
  assert.equal(transition(fixture, state, "shift").reason, "shift-blocked");
  const tutorial = { ...initialState(levels[0]), x: 3 };
  assert.equal(transition(levels[0], tutorial, "shift").changed, false);
});

test("exit requires every key; winning states reject all further actions", () => {
  const start = { ...initialState(fixture), x: 5, y: 2 };
  const locked = transition(fixture, start, "up");
  assert.equal(locked.state.won, false);
  assert.equal(locked.event, "locked-exit");
  const won = transition(fixture, { ...start, keys: 1 }, "up").state;
  assert.equal(won.won, true);
  for (const action of ACTIONS)
    assert.equal(transition(fixture, won, action).changed, false);
  assert.deepEqual(solve(fixture, won), []);
});

test("transition does not mutate history snapshots", () => {
  const state = Object.freeze(initialState(fixture));
  const next = transition(fixture, state, "right").state;
  assert.equal(state.keys, 0);
  assert.equal(state.moves, 0);
  assert.equal(next.keys, 1);
});

test("solver returns shortest paths and null for unreachable exits", () => {
  const simple = defineLevel({
    id: "simple",
    start: { x: 1, y: 1 },
    maps: [
      ["#####", "#..E#", "#####"],
      ["#####", "#...#", "#####"],
    ],
  });
  assert.deepEqual(solve(simple), ["right", "right"]);
  simple.maps[0][1][2] = "#";
  simple.maps[1][1][2] = "#";
  assert.equal(solve(simple), null);
});

test("stars count movement and world changes using exact threshold boundaries", () => {
  assert.equal(starsFor(14, 14), 3);
  assert.equal(starsFor(15, 14), 2);
  assert.equal(starsFor(21, 14), 2);
  assert.equal(starsFor(22, 14), 1);
});

test("level parser rejects ragged maps and invalid symbols", () => {
  assert.throws(
    () =>
      defineLevel({
        ...fixture,
        maps: [
          ["###", "#.E#"],
          ["###", "###"],
        ],
      }),
    /dimensions/,
  );
  assert.throws(
    () =>
      defineLevel({
        ...fixture,
        maps: [
          ["###", "#?E"],
          ["###", "###"],
        ],
      }),
    /Unknown tile/,
  );
});

const knownOptima = [14, 16, 14, 18, 28];
for (const [index, level] of levels.entries()) {
  test(`${level.title}: shortest solution wins and uses the intended mechanics`, () => {
    const path = solve(level);
    assert.equal(path.length, knownOptima[index]);
    const result = play(level, path);
    assert.equal(result.won, true);
    assert.equal(result.keys, level.requiredKeys);
    assert.ok(result.shifts >= 2);
    if (index === 3) assert.equal(result.switches, 1);
    if (index === 4) assert.equal(result.switches, 3);
  });

  test(`${level.title}: every reachable state has a route to an exit (no softlocks)`, () => {
    // Enumerate the graph once, then traverse reverse edges from all winning states.
    const first = initialState(level);
    const queue = [first];
    const visited = new Set([stateKey(first)]);
    const reverse = new Map();
    const winning = [];
    for (let head = 0; head < queue.length; head++) {
      const state = queue[head];
      const from = stateKey(state);
      if (state.won) {
        winning.push(from);
        continue;
      }
      for (const action of ACTIONS) {
        const result = transition(level, state, action);
        if (!result.changed) continue;
        const to = stateKey(result.state);
        if (!reverse.has(to)) reverse.set(to, []);
        reverse.get(to).push(from);
        if (!visited.has(to)) {
          visited.add(to);
          queue.push(result.state);
        }
      }
    }
    assert.ok(winning.length > 0);
    const canWin = new Set(winning);
    for (let head = 0; head < winning.length; head++) {
      for (const previous of reverse.get(winning[head]) ?? []) {
        if (!canWin.has(previous)) {
          canWin.add(previous);
          winning.push(previous);
        }
      }
    }
    assert.equal(
      canWin.size,
      visited.size,
      `${visited.size - canWin.size} states cannot win`,
    );
  });
}
