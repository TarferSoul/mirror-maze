import { levels } from "./levels.js";
import {
  initialState,
  transition,
  solve,
  countKeys,
  starsFor,
  tileAt,
  canEnter,
} from "./engine.js";
import {
  readProgress,
  writeProgress,
  unlockedThrough,
  recordWin,
} from "./storage.js";

const $ = (selector) => document.querySelector(selector);
const icon = (name) =>
  `<svg class="tile-icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const names = ["现实世界", "镜像世界"];
const actionNames = {
  up: "向上移动",
  right: "向右移动",
  down: "向下移动",
  left: "向左移动",
  shift: "切换世界",
};
let storage;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
const progress = readProgress(storage, levels);
const optimal = levels.map((level) => solve(level)?.length);
let current = progress.selected;
let state = initialState(levels[current]);
let history = [];
let hints = 0;
let hintAction = null;
let lastHintKey = null;
let soundContext;
let saveFailed = false;

function save() {
  saveFailed = !writeProgress(storage, progress);
  $("#save-status").textContent = saveFailed
    ? "浏览器存储不可用，本次进度仍可继续游玩"
    : "进度自动保存在此浏览器";
  $("#save-status").classList.toggle("storage-warning", saveFailed);
}

function message(text, warning = false) {
  $("#status").textContent = text;
  $("#status").classList.toggle("warning", warning);
}

function tone(event) {
  if (!progress.sound) return;
  try {
    soundContext ??= new (window.AudioContext || window.webkitAudioContext)();
    if (soundContext.state === "suspended")
      soundContext.resume().catch(() => {});
    const notes = {
      move: [330],
      shift: [330, 494],
      key: [660, 880],
      plate: [440, 660],
      win: [523, 659, 784, 1047],
    }[event] || [140];
    notes.forEach((frequency, index) => {
      const oscillator = soundContext.createOscillator();
      const gain = soundContext.createGain();
      const start = soundContext.currentTime + index * 0.09;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.045, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
      oscillator.connect(gain);
      gain.connect(soundContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.15);
    });
  } catch {
    /* Audio is optional; restricted browsers remain fully playable. */
  }
}

function renderMap(container, world, miniature = false) {
  const level = levels[current];
  container.style.setProperty("--cols", level.width);
  container.style.setProperty("--rows", level.height);
  container.style.gridTemplateColumns = `repeat(${level.width}, 1fr)`;
  container.style.gridTemplateRows = `repeat(${level.height}, minmax(0, 1fr))`;
  container.dataset.world = world;
  const fragment = document.createDocumentFragment();
  const hintState = hintAction
    ? transition(level, state, hintAction).state
    : null;
  level.maps[world].forEach((row, y) =>
    row.forEach((tile, x) => {
      const cell = document.createElement("div");
      cell.className = miniature ? "mini-tile" : "tile";
      cell.setAttribute("aria-hidden", "true");
      cell.dataset.x = x;
      cell.dataset.y = y;
      if (tile === "#") cell.classList.add("wall");
      if (tile === "E") {
        cell.classList.add("exit");
        if (!miniature) cell.innerHTML = icon("exit");
      }
      if (tile === "k" && !(state.keys & level.keyBits[`${world}:${x}:${y}`])) {
        cell.classList.add("key");
        if (!miniature) cell.innerHTML = icon("key");
      }
      if ("ab".includes(tile)) {
        const active = !!(state.switches & (tile === "a" ? 1 : 2));
        cell.classList.add("plate");
        if (active) cell.classList.add("activated");
        if (!miniature)
          cell.innerHTML = `<span class="plate-symbol">${tile.toUpperCase()}</span>`;
      }
      if ("AB".includes(tile)) {
        cell.classList.add("gate");
        cell.dataset.label = tile;
        if (canEnter(tile, state)) cell.classList.add("open");
        if (!miniature)
          cell.innerHTML = `<span class="gate-symbol">${tile}</span>`;
      }
      if (state.x === x && state.y === y) {
        if (miniature) cell.classList.add("player-dot");
        else {
          cell.classList.add("has-player");
          cell.insertAdjacentHTML("beforeend", '<span class="player"></span>');
        }
      }
      if (!miniature && hintState?.x === x && hintState?.y === y)
        cell.classList.add("hinted");
      fragment.append(cell);
    }),
  );
  container.replaceChildren(fragment);
  container.setAttribute(
    "aria-label",
    miniature
      ? `${names[world]}地图预览，圆点位于第 ${state.x} 列、第 ${state.y} 行`
      : `${names[world]}，位于第 ${state.x} 列、第 ${state.y} 行，已收集 ${countKeys(state)} 把钥匙`,
  );
}

function renderNavigation() {
  const unlocked = unlockedThrough(progress, levels);
  $("#levels").innerHTML = levels
    .map((level, index) => {
      const record = progress.records[level.id];
      return `<button class="level-button" data-level="${index}" ${index > unlocked ? "disabled" : ""} ${index === current ? 'aria-current="step"' : ""} aria-label="第 ${index + 1} 关：${level.title}${index > unlocked ? "，尚未解锁" : record ? "，已完成" : ""}"><span class="level-number">${String(index + 1).padStart(2, "0")}</span><span class="level-text">${level.title}<small class="${record ? "level-stars" : ""}">${record ? "★".repeat(record.stars) + "☆".repeat(3 - record.stars) : level.mechanic}</small></span>${index > unlocked ? '<svg class="level-lock"><use href="#i-lock"/></svg>' : ""}</button>`;
    })
    .join("");
  $("#journey-progress").textContent =
    `${levels.filter((level) => progress.records[level.id]).length} / ${levels.length} 已完成`;
}

function render() {
  const level = levels[current];
  document.body.dataset.world = state.world;
  $("#board").dataset.level = current;
  $("#board").dataset.won = state.won;
  $("#world-name").textContent = names[state.world];
  $("#board-caption").textContent =
    state.world === 0 ? "REALITY / 01" : "REFLECTION / 02";
  $("#coordinate").textContent =
    `X ${String(state.x).padStart(2, "0")} · Y ${String(state.y).padStart(2, "0")}`;
  $("#preview-title").textContent = `另一面 · ${names[1 - state.world]}`;
  $("#moves").textContent = String(state.moves).padStart(2, "0");
  $("#shifts").textContent = String(state.shifts).padStart(2, "0");
  $("#key-count").textContent = level.keyCount
    ? `${countKeys(state)} / ${level.keyCount} 已收集`
    : "无需钥匙";
  const plates = ["a", "b"].filter((tile) =>
    level.maps.some((map) => map.some((row) => row.includes(tile))),
  );
  $("#plate-objective").hidden = plates.length === 0;
  $("#plate-count").textContent = plates
    .map(
      (tile) =>
        `${tile.toUpperCase()} ${state.switches & (tile === "a" ? 1 : 2) ? "已激活" : "未激活"}`,
    )
    .join(" · ");
  const best = progress.records[level.id];
  $("#best").textContent = best ? best.moves + best.shifts : "—";
  $("#undo").disabled = history.length === 0 || state.won;
  $("#hint").disabled = state.won;
  $("#shift").disabled = state.won;
  $("#mobile-shift").disabled = state.won;
  $("#results").hidden = !state.won;
  document.querySelectorAll("[data-world-select]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(Number(button.dataset.worldSelect) === state.world),
    );
    button.disabled = state.won;
  });
  const available = canEnter(tileAt(level, state, 1 - state.world), state);
  $("#shift-availability").textContent = state.won
    ? "本关已完成"
    : available
      ? "此处可以穿越"
      : "另一面被阻挡，请先移动";
  renderMap($("#board"), state.world);
  renderMap($("#minimap"), 1 - state.world, true);
}

function loadLevel(index) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index > unlockedThrough(progress, levels)
  )
    return;
  current = index;
  state = initialState(levels[index]);
  history = [];
  hints = 0;
  hintAction = null;
  lastHintKey = null;
  progress.selected = index;
  $("#level-title").textContent = levels[index].title;
  $("#level-subtitle").textContent =
    `CHAPTER ${String(index + 1).padStart(2, "0")} / ${levels[index].subtitle}`;
  $("#description").textContent = levels[index].description;
  $("#level-tip").textContent = levels[index].tip;
  renderNavigation();
  render();
  message(
    index === 0
      ? "从发光的方块出发。方向键移动，空格穿越。"
      : levels[index].tip,
  );
  $("#board").focus({ preventScroll: true });
  save();
}

function showWin() {
  const level = levels[current];
  const total = state.moves + state.shifts;
  const stars = starsFor(total, optimal[current]);
  const final = current === levels.length - 1;
  $("#win-stars").innerHTML =
    "★".repeat(stars) +
    `<span class="dim-star">${"★".repeat(3 - stars)}</span>`;
  $("#win-stars").setAttribute("aria-label", `获得 ${stars} 星`);
  $("#win-eyebrow").textContent = final
    ? "WORLDS REUNITED"
    : "CROSSING COMPLETE";
  $("#win-title").textContent = final ? "两界归一，旅程完成" : "穿越成功";
  $("#win-description").textContent = final
    ? "你已走过全部五个迷宫。每一条路，都在另一面留下了回响。"
    : `「${level.title}」已完成，新的路径正在等待你。`;
  $("#win-stats").innerHTML =
    `<div><strong>${state.moves}</strong><span>移动步数</span></div><div><strong>${state.shifts}</strong><span>世界切换</span></div><div><strong>${total}</strong><span>总步数</span></div>`;
  $("#win-record").textContent =
    `最短路线 ${optimal[current]} 步 · 本次提示 ${hints} 次${saveFailed ? " · 进度暂未保存" : " · 成绩已保存"}`;
  $("#next").textContent = final ? "回到第一关" : "继续下一关 →";
  if (!$("#win-dialog").open) $("#win-dialog").showModal();
}

function act(action) {
  if (document.querySelector("dialog[open]")) return;
  $("#board").focus({ preventScroll: true });
  const result = transition(levels[current], state, action);
  if (!result.changed) {
    if (state.won) return;
    const reason = {
      "shift-blocked": "另一面的同一格被阻挡了。换个位置再穿越。",
      wall: "前方是墙。试着从另一世界寻找道路。",
      gate: "这扇门尚未开启。先找到同名的圆形机关。",
    };
    message(reason[result.reason] || "现在无法执行这个操作。", true);
    $("#board").classList.remove("bump");
    void $("#board").offsetWidth;
    $("#board").classList.add("bump");
    return;
  }
  history.push(state);
  state = result.state;
  hintAction = null;
  lastHintKey = null;
  tone(result.event);
  if (state.won) {
    recordWin(progress, levels[current], {
      moves: state.moves,
      shifts: state.shifts,
      hints,
      stars: starsFor(state.moves + state.shifts, optimal[current]),
    });
    save();
    renderNavigation();
  }
  render();
  const eventMessages = {
    move: `${names[state.world]} · 第 ${state.x} 列，第 ${state.y} 行`,
    shift: `已穿越至${names[state.world]}。熟悉的位置，全新的道路。`,
    key: "收集到光之钥匙！它会跟随你穿越世界。",
    plate: "机关已产生共鸣！两个世界的同名门已开启。",
    "locked-exit": "出口还缺少光芒。收集全部钥匙后再回来。",
    win: "关卡已完成！可以查看成绩或选择已解锁的关卡。",
  };
  message(eventMessages[result.event]);
  if (action === "shift") {
    $("#board").classList.remove("world-flash");
    void $("#board").offsetWidth;
    $("#board").classList.add("world-flash");
  }
  if (state.won) showWin();
}

function undo() {
  if (!history.length || state.won) return;
  $("#board").focus({ preventScroll: true });
  state = history.pop();
  hintAction = null;
  lastHintKey = null;
  render();
  message("已撤销上一步。钥匙与机关也恢复到上一步的状态。");
}

function hint() {
  if (state.won) return;
  $("#board").focus({ preventScroll: true });
  const path = solve(levels[current], state);
  if (!path?.length) {
    message("暂时没有可用路线，可以撤销或重新开始。", true);
    return;
  }
  const key = JSON.stringify(state);
  if (key !== lastHintKey) hints++;
  lastHintKey = key;
  hintAction = path[0];
  render();
  message(
    `下一步：${actionNames[path[0]]}。从此处到出口最少还需 ${path.length} 步。`,
  );
}

$("#levels").addEventListener("click", (event) => {
  const button = event.target.closest("[data-level]");
  if (button && !button.disabled) loadLevel(Number(button.dataset.level));
});
document.querySelectorAll("[data-world-select]").forEach((button) =>
  button.addEventListener("click", () => {
    if (Number(button.dataset.worldSelect) !== state.world) act("shift");
  }),
);
document
  .querySelectorAll("[data-action]")
  .forEach((button) =>
    button.addEventListener("click", () => act(button.dataset.action)),
  );
$("#shift").addEventListener("click", () => act("shift"));
$("#mobile-shift").addEventListener("click", () => act("shift"));
$("#undo").addEventListener("click", undo);
$("#restart").addEventListener("click", () => loadLevel(current));
$("#hint").addEventListener("click", hint);
$("#results").addEventListener("click", showWin);
$("#start").addEventListener("click", () => {
  progress.started = true;
  save();
  $("#intro-dialog").close();
  $("#start").blur();
});
$("#intro-dialog").addEventListener("cancel", () => {
  progress.started = true;
  save();
});
$("#help").addEventListener("click", () => $("#help-dialog").showModal());
document
  .querySelectorAll("[data-close]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      $(`#${button.dataset.close}`).close(),
    ),
  );
$("#next").addEventListener("click", () => {
  $("#win-dialog").close();
  loadLevel(current === levels.length - 1 ? 0 : current + 1);
});
$("#replay").addEventListener("click", () => {
  $("#win-dialog").close();
  loadLevel(current);
});

function renderSound() {
  $("#sound").setAttribute("aria-pressed", String(progress.sound));
  $("#sound").setAttribute(
    "aria-label",
    progress.sound ? "关闭音效" : "开启音效",
  );
}
$("#sound").addEventListener("click", () => {
  progress.sound = !progress.sound;
  renderSound();
  save();
  tone("key");
});
window.addEventListener("keydown", (event) => {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    document.querySelector("dialog[open]") ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) ||
    event.target.isContentEditable
  )
    return;
  // Let focused buttons retain Space/Enter activation for keyboard accessibility.
  if (
    (event.code === "Space" || event.code === "Enter") &&
    event.target.closest("button, a")
  )
    return;
  const key = event.key.toLowerCase();
  const action = {
    arrowup: "up",
    w: "up",
    arrowright: "right",
    d: "right",
    arrowdown: "down",
    s: "down",
    arrowleft: "left",
    a: "left",
    " ": "shift",
  }[key];
  if (action) {
    event.preventDefault();
    if (action === "shift" && event.repeat) return;
    act(action);
  } else if (["z", "r", "h"].includes(key)) {
    event.preventDefault();
    if (!event.repeat)
      ({ z: undo, r: () => loadLevel(current), h: hint })[key]();
  }
});

loadLevel(current);
renderSound();
if (!progress.started) $("#intro-dialog").showModal();
