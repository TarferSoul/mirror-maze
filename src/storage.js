export const STORAGE_KEY = "mirror-maze:v1";
export const emptyProgress = () => ({
  version: 1,
  started: false,
  selected: 0,
  sound: false,
  records: {},
});

export function readProgress(storage, levels) {
  const fresh = emptyProgress();
  try {
    const data = JSON.parse(storage.getItem(STORAGE_KEY));
    if (!data || data.version !== 1) return fresh;
    fresh.started = data.started === true;
    fresh.sound = data.sound === true;
    for (const level of levels) {
      const record = data.records?.[level.id];
      if (
        record &&
        ["moves", "shifts", "hints"].every(
          (key) => Number.isSafeInteger(record[key]) && record[key] >= 0,
        ) &&
        Number.isInteger(record.stars) &&
        record.stars >= 1 &&
        record.stars <= 3 &&
        record.moves + record.shifts > 0
      ) {
        fresh.records[level.id] = {
          moves: record.moves,
          shifts: record.shifts,
          hints: record.hints,
          stars: record.stars,
        };
      }
    }
    fresh.selected = Number.isInteger(data.selected)
      ? Math.max(0, Math.min(data.selected, unlockedThrough(fresh, levels)))
      : 0;
    return fresh;
  } catch {
    return fresh;
  }
}

export function writeProgress(storage, progress) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export function unlockedThrough(progress, levels) {
  let index = 0;
  while (index < levels.length - 1 && progress.records[levels[index].id])
    index++;
  return index;
}

export function recordWin(progress, level, record) {
  const previous = progress.records[level.id];
  if (
    !previous ||
    record.moves + record.shifts < previous.moves + previous.shifts ||
    (record.moves + record.shifts === previous.moves + previous.shifts &&
      record.hints < previous.hints)
  ) {
    progress.records[level.id] = { ...record };
  }
}
