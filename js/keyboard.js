// The piano keyboard component (spec §8). One octave, real <button>
// elements, shared by all three modes and by Free Play. It owns selection and
// the six visual states; it does not know what a question is or whether an
// answer is right.
//
// The octave it *sounds* is the caller's business: the component reports the
// pitch class it always has, plus the MIDI note that pitch class maps to at
// the current base. The game leaves the base at C4; Free Play moves it.

import {
  KEYBOARD_BASE_MIDI,
  keyLabel,
  ariaNoteName,
  isBlackKey,
  octaveOf,
  pitchClass,
} from "./theory.js";

// The DAW-standard row: accidentals sit on the upper row directly above
// their white keys, so the hand shape matches a real keyboard (spec §8).
export const SHORTCUT_KEYS = ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j"];

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
// Black keys are centred on the boundary after these white-key indices.
const BLACK_KEYS = [
  { pc: 1, after: 0 },
  { pc: 3, after: 1 },
  { pc: 6, after: 3 },
  { pc: 8, after: 4 },
  { pc: 10, after: 5 },
];

const WHITE_WIDTH = 100 / WHITE_PCS.length;
const BLACK_WIDTH = WHITE_WIDTH * 0.58;
const SOUNDING_MS = 340;

const MARKS = { correct: "✓", wrong: "✕", missed: "+" };
const MARK_WORDS = { correct: "correct", wrong: "your wrong pick", missed: "missed note" };

export function createKeyboard(container, options = {}) {
  const {
    onKeyPress,
    onSelectionChange,
    mode = "single",
    baseMidi = KEYBOARD_BASE_MIDI,
    // Free Play moves between octaves, so its keys have to say which one they
    // are on; the game's single octave would only be noise.
    announceOctave = false,
  } = options;

  let selectMode = mode;
  let base = baseMidi;
  let selection = [];
  let enabled = true;
  let destroyed = false;
  const keys = new Map(); // pc -> button
  const soundingTimers = new Map();

  container.innerHTML = "";
  container.classList.add("keyboard");

  const keysWrap = document.createElement("div");
  keysWrap.className = "keyboard-keys";
  keysWrap.setAttribute("role", "group");
  keysWrap.setAttribute("aria-label", "Piano keyboard, one octave");

  function buildKey(pc, index) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `key ${isBlackKey(pc) ? "key--black" : "key--white"}`;
    btn.dataset.pc = String(pc);
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", noteAria(pc));

    const label = document.createElement("span");
    label.className = "key-name";
    label.textContent = keyLabel(pc);

    const shortcut = document.createElement("span");
    shortcut.className = "key-shortcut";
    shortcut.setAttribute("aria-hidden", "true");
    shortcut.textContent = SHORTCUT_KEYS[pc].toUpperCase();

    const mark = document.createElement("span");
    mark.className = "key-mark";
    mark.setAttribute("aria-hidden", "true");

    btn.append(shortcut, mark, label);
    btn.addEventListener("click", () => press(pc));

    if (isBlackKey(pc)) {
      const { after } = BLACK_KEYS.find((b) => b.pc === pc);
      btn.style.left = `${(after + 1) * WHITE_WIDTH - BLACK_WIDTH / 2}%`;
      btn.style.width = `${BLACK_WIDTH}%`;
    } else {
      btn.style.flex = "1 1 0";
    }
    void index;
    return btn;
  }

  WHITE_PCS.forEach((pc, i) => {
    const btn = buildKey(pc, i);
    keys.set(pc, btn);
    keysWrap.appendChild(btn);
  });
  BLACK_KEYS.forEach(({ pc }, i) => {
    const btn = buildKey(pc, i);
    keys.set(pc, btn);
    keysWrap.appendChild(btn);
  });

  container.appendChild(keysWrap);

  // ---------- Labels ----------

  function midiFor(pc) {
    return base + pitchClass(pc);
  }

  function noteAria(pc) {
    const name = ariaNoteName(pc);
    return announceOctave ? `${name}, octave ${octaveOf(midiFor(pc))}` : name;
  }

  function refreshLabels() {
    keys.forEach((btn, pc) => {
      // Only the untouched keys: a marked key's label belongs to markResult.
      if (btn.querySelector(".key-mark").textContent) return;
      btn.setAttribute("aria-label", noteAria(pc));
    });
  }

  // ---------- Selection ----------

  function syncSelectionAttrs() {
    keys.forEach((btn, pc) => {
      const on = selection.includes(pc);
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function press(pc) {
    if (!enabled || destroyed) return;

    // Free Play has nothing to submit, so a press there is a note and nothing
    // else — keys must not latch on the way a chord answer does.
    if (selectMode !== "free") {
      if (selectMode === "single") {
        selection = [pc];
      } else if (selection.includes(pc)) {
        selection = selection.filter((p) => p !== pc);
      } else {
        selection = [...selection, pc].sort((a, b) => a - b);
      }
      syncSelectionAttrs();
    }

    // The keyboard is playable: pressing a key always sounds it, which is how
    // a player checks a guess against the reference (spec §8).
    if (typeof onKeyPress === "function") onKeyPress(pc, midiFor(pc));
    if (selectMode !== "free" && typeof onSelectionChange === "function") {
      onSelectionChange(getSelection());
    }
  }

  function getSelection() {
    return [...selection].sort((a, b) => a - b);
  }

  // ---------- Physical keys ----------

  function onDocumentKeyDown(event) {
    if (!enabled || destroyed) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // A held key would otherwise machine-gun the note at the OS repeat rate.
    if (event.repeat) return;

    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
    }

    const pc = SHORTCUT_KEYS.indexOf(event.key.toLowerCase());
    if (pc === -1) return;

    event.preventDefault();
    press(pc);
    const btn = keys.get(pc);
    if (btn) {
      btn.classList.add("is-pressed");
      setTimeout(() => btn.classList.remove("is-pressed"), 120);
    }
  }

  document.addEventListener("keydown", onDocumentKeyDown);

  // ---------- Public API ----------

  return {
    element: container,

    setMode(next) {
      selectMode = next;
      selection = [];
      syncSelectionAttrs();
      if (typeof onSelectionChange === "function") onSelectionChange(getSelection());
    },

    // The MIDI note the leftmost key (C) sounds. Pitch classes, and therefore
    // selection and marks, are unaffected.
    setBaseMidi(next) {
      base = next;
      refreshLabels();
    },

    getBaseMidi() {
      return base;
    },

    getSelection,

    setSelection(pcs) {
      selection = [...new Set(pcs.map(pitchClass))].sort((a, b) => a - b);
      syncSelectionAttrs();
      if (typeof onSelectionChange === "function") onSelectionChange(getSelection());
    },

    clearSelection() {
      selection = [];
      syncSelectionAttrs();
      if (typeof onSelectionChange === "function") onSelectionChange(getSelection());
    },

    setEnabled(next) {
      enabled = Boolean(next);
      keys.forEach((btn) => {
        btn.disabled = !enabled;
      });
      container.classList.toggle("is-locked", !enabled);
    },

    // Feedback states. Correct/wrong/missed each carry a glyph and a word in
    // the aria-label as well as a colour — never colour alone (spec §8).
    markResult({ correct = [], wrong = [], missed = [] } = {}) {
      const apply = (pcs, state) => {
        pcs.forEach((pc) => {
          const btn = keys.get(pitchClass(pc));
          if (!btn) return;
          btn.classList.add(`is-${state}`);
          btn.querySelector(".key-mark").textContent = MARKS[state];
          btn.setAttribute("aria-label", `${noteAria(pc)} — ${MARK_WORDS[state]}`);
        });
      };
      apply(correct, "correct");
      apply(wrong, "wrong");
      apply(missed, "missed");
    },

    clearMarks() {
      keys.forEach((btn, pc) => {
        btn.classList.remove("is-correct", "is-wrong", "is-missed", "is-sounding", "is-pressed");
        btn.querySelector(".key-mark").textContent = "";
        btn.setAttribute("aria-label", noteAria(pc));
      });
      soundingTimers.forEach((id) => clearTimeout(id));
      soundingTimers.clear();
    },

    // The visual counterpart to a note sounding, so the game is followable
    // with the volume down (spec §8).
    flash(pc) {
      const key = pitchClass(pc);
      const btn = keys.get(key);
      if (!btn) return;
      btn.classList.remove("is-sounding");
      // Force a reflow so a repeated flash restarts the animation.
      void btn.offsetWidth;
      btn.classList.add("is-sounding");
      clearTimeout(soundingTimers.get(key));
      soundingTimers.set(
        key,
        setTimeout(() => btn.classList.remove("is-sounding"), SOUNDING_MS)
      );
    },

    setShortcutLabels(show) {
      container.classList.toggle("hide-shortcuts", !show);
    },

    destroy() {
      destroyed = true;
      document.removeEventListener("keydown", onDocumentKeyDown);
      soundingTimers.forEach((id) => clearTimeout(id));
      soundingTimers.clear();
    },
  };
}
