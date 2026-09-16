/** Pure game rules. The renderer, solver and tests share this transition function. */
export const ACTIONS = Object.freeze(["up", "right", "down", "left", "shift"]);
const DELTAS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

export function defineLevel(config) {
  const maps = config.maps.map((rows) => rows.map((row) => [...row]));
  const height = maps[0].length;
  const width = maps[0][0].length;
  if (
    maps.length !== 2 ||
    maps.some(
      (map) => map.length !== height || map.some((row) => row.length !== width),
    )
  ) {
    throw new Error(`Invalid map dimensions: ${config.id}`);
  }
  const keyBits = {};
  let keyCount = 0;
  let exits = 0;
  maps.forEach((map, world) =>
    map.forEach((row, y) =>
      row.forEach((tile, x) => {
        if (!"#.kabABE".includes(tile)) throw new Error(`Unknown tile ${tile}`);
        if (tile === "k") keyBits[`${world}:${x}:${y}`] = 1 << keyCount++;
        if (tile === "E") exits++;
      }),
    ),
  );
  if (keyCount > 10 || exits !== 1)
    throw new Error("A level needs one exit and at most 10 keys");
  const level = {
    ...config,
    maps,
    width,
    height,
    keyBits,
    keyCount,
    requiredKeys: (1 << keyCount) - 1,
  };
  const { x, y, world = 0 } = config.start;
  if (maps[world]?.[y]?.[x] !== ".")
    throw new Error(`Invalid start: ${config.id}`);
  return level;
}

export function initialState(level) {
  return {
    x: level.start.x,
    y: level.start.y,
    world: level.start.world ?? 0,
    keys: 0,
    switches: 0,
    moves: 0,
    shifts: 0,
    won: false,
  };
}

export function tileAt(
  level,
  state,
  world = state.world,
  x = state.x,
  y = state.y,
) {
  return level.maps[world]?.[y]?.[x] ?? "#";
}

export function canEnter(tile, state) {
  return (
    tile !== "#" &&
    (tile !== "A" || !!(state.switches & 1)) &&
    (tile !== "B" || !!(state.switches & 2))
  );
}

export function transition(level, state, action) {
  if (state.won || !ACTIONS.includes(action))
    return { state, changed: false, reason: "inactive" };
  const next = { ...state };
  if (action === "shift") next.world = 1 - state.world;
  else {
    next.x += DELTAS[action][0];
    next.y += DELTAS[action][1];
  }
  const tile = tileAt(level, next);
  if (!canEnter(tile, next)) {
    return {
      state,
      changed: false,
      reason:
        action === "shift" ? "shift-blocked" : tile === "#" ? "wall" : "gate",
    };
  }
  if (action === "shift") next.shifts++;
  else next.moves++;
  let event = action === "shift" ? "shift" : "move";
  if (tile === "k") {
    const bit = level.keyBits[`${next.world}:${next.x}:${next.y}`];
    if (!(next.keys & bit)) event = "key";
    next.keys |= bit;
  }
  if (tile === "a" || tile === "b") {
    const bit = tile === "a" ? 1 : 2;
    if (!(next.switches & bit)) event = "plate";
    next.switches |= bit;
  }
  if (tile === "E") {
    next.won = next.keys === level.requiredKeys;
    event = next.won ? "win" : "locked-exit";
  }
  return { state: next, changed: true, event };
}

export function stateKey(state) {
  return `${state.x},${state.y},${state.world},${state.keys},${state.switches}`;
}

/** Breadth-first search; all five actions have unit cost. Returns a shortest action sequence. */
export function solve(level, start = initialState(level)) {
  if (start.won) return [];
  const queue = [{ state: start, parent: -1, action: null }];
  const seen = new Set([stateKey(start)]);
  for (let head = 0; head < queue.length; head++) {
    for (const action of ACTIONS) {
      const result = transition(level, queue[head].state, action);
      if (!result.changed) continue;
      const key = stateKey(result.state);
      if (seen.has(key)) continue;
      seen.add(key);
      const index =
        queue.push({ state: result.state, parent: head, action }) - 1;
      if (result.state.won) {
        const path = [];
        for (
          let cursor = index;
          queue[cursor].parent !== -1;
          cursor = queue[cursor].parent
        )
          path.push(queue[cursor].action);
        return path.reverse();
      }
    }
  }
  return null;
}

export function countKeys(state) {
  return state.keys.toString(2).replaceAll("0", "").length;
}

export function starsFor(actions, optimum) {
  return actions <= optimum ? 3 : actions <= Math.ceil(optimum * 1.5) ? 2 : 1;
}
