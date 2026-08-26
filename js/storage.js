// localStorage persistence (spec §11). No backend, no accounts, no analytics.
// Every access is wrapped: private-mode browsers throw on localStorage, and
// the game has to keep working with persistence unavailable.

const HISTORY_KEY = "chordji.history";
const BEST_KEY = "chordji.best";
const SETTINGS_KEY = "chordji.settings";
const MAX_HISTORY = 20;

export const DEFAULT_SETTINGS = {
  volume: 0.7,
  chordStyle: "block", // 'block' | 'arpeggio'
  showShortcuts: true,
  legendDismissed: false,
  mode: "note",
  difficulty: "easy",
  lengthType: "count", // 'count' | 'timed'
  lengthValue: 10,
};

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const value = JSON.parse(raw);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function comboKey({ mode, difficulty, lengthType, lengthValue }) {
  return `${mode}:${difficulty}:${lengthType}:${lengthValue}`;
}

export function loadHistory() {
  const history = read(HISTORY_KEY, []);
  return Array.isArray(history) ? history : [];
}

export function loadBest() {
  const best = read(BEST_KEY, {});
  return best && typeof best === "object" ? best : {};
}

export function saveSessionResult(entry) {
  const history = loadHistory();
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  write(HISTORY_KEY, history);

  const best = loadBest();
  const key = comboKey(entry);
  const existing = best[key];
  if (!existing || entry.accuracy > existing.accuracy) {
    best[key] = { accuracy: entry.accuracy, timestamp: entry.timestamp };
    write(BEST_KEY, best);
  }
}

export function getBestFor(settings) {
  return loadBest()[comboKey(settings)] || null;
}

export function getLastFor(settings) {
  const key = comboKey(settings);
  return loadHistory().find((entry) => comboKey(entry) === key) || null;
}

export function loadSettings() {
  const stored = read(SETTINGS_KEY, {});
  return { ...DEFAULT_SETTINGS, ...(stored && typeof stored === "object" ? stored : {}) };
}

export function saveSettings(settings) {
  const allowed = Object.keys(DEFAULT_SETTINGS);
  const next = {};
  allowed.forEach((key) => {
    if (settings[key] !== undefined) next[key] = settings[key];
  });
  write(SETTINGS_KEY, { ...loadSettings(), ...next });
}
