// Bootstrap, screen routing and keyboard shortcuts (spec §2, §9).

import { AudioEngine, NOTE_DURATION, CHORD_DURATION } from "./audio.js";
import { createKeyboard } from "./keyboard.js";
import { createGenerator, MODES, POOL_SUMMARY } from "./generator.js";
import * as game from "./game.js";
import * as storage from "./storage.js";
import * as ui from "./ui.js";
import {
  bothNames,
  bothNamesWithOctave,
  chordTeachingNote,
  midiForPc,
  noteTeachingNote,
  octaveOf,
  voicePcs,
} from "./theory.js";

const els = {
  screens: {
    setup: document.getElementById("screen-setup"),
    freeplay: document.getElementById("screen-freeplay"),
    question: document.getElementById("screen-question"),
    results: document.getElementById("screen-results"),
  },
  audioNotice: document.getElementById("audio-notice"),
  modeGroup: document.getElementById("mode-group"),
  difficultyGroup: document.getElementById("difficulty-group"),
  poolSummary: document.getElementById("pool-summary"),
  lengthTypeGroup: document.getElementById("length-type-group"),
  lengthValueGroup: document.getElementById("length-value-group"),
  volume: document.getElementById("volume"),
  volumeValue: document.getElementById("volume-value"),
  testSoundBtn: document.getElementById("test-sound-btn"),
  shortcutLabels: document.getElementById("shortcut-labels"),
  statLine: document.getElementById("stat-line"),
  startBtn: document.getElementById("start-btn"),
  freePlayBtn: document.getElementById("free-play-btn"),

  freeBackBtn: document.getElementById("free-back-btn"),
  freeKeyboard: document.getElementById("free-keyboard"),
  freeReadout: document.getElementById("free-readout"),
  octaveDisplay: document.getElementById("octave-display"),
  octaveDownBtn: document.getElementById("octave-down-btn"),
  octaveUpBtn: document.getElementById("octave-up-btn"),
  freeSustainGroup: document.getElementById("free-sustain-group"),
  freeVolume: document.getElementById("free-volume"),
  freeVolumeValue: document.getElementById("free-volume-value"),

  progressIndicator: document.getElementById("progress-indicator"),
  streakIndicator: document.getElementById("streak-indicator"),
  quitBtn: document.getElementById("quit-btn"),
  timerBar: document.getElementById("timer-bar"),
  timerFill: document.getElementById("timer-fill"),
  playPanel: document.querySelector("#screen-question .panel"),
  promptQuestion: document.getElementById("prompt-question"),
  promptChord: document.getElementById("prompt-chord"),
  audioControls: document.getElementById("audio-controls"),
  replayBtn: document.getElementById("replay-btn"),
  referenceBtn: document.getElementById("reference-btn"),
  styleGroup: document.getElementById("style-group"),
  keyboard: document.getElementById("keyboard"),
  keyLegend: document.getElementById("key-legend"),
  selectionCounter: document.getElementById("selection-counter"),
  playActions: document.getElementById("play-actions"),
  checkBtn: document.getElementById("check-btn"),
  feedback: document.getElementById("feedback"),
  feedbackStatus: document.getElementById("feedback-status"),
  feedbackAnswer: document.getElementById("feedback-answer"),
  feedbackTeach: document.getElementById("feedback-teach"),
  nextBtn: document.getElementById("next-btn"),
  shortcutLegend: document.getElementById("shortcut-legend"),
  dismissLegendBtn: document.getElementById("dismiss-legend-btn"),

  resultsSummary: document.getElementById("results-summary"),
  mostMissed: document.getElementById("most-missed"),
  reviewList: document.getElementById("review-list"),
  playAgainBtn: document.getElementById("play-again-btn"),
  newSessionBtn: document.getElementById("new-session-btn"),

  quitModal: document.getElementById("quit-modal"),
  quitCancelBtn: document.getElementById("quit-cancel-btn"),
  quitConfirmBtn: document.getElementById("quit-confirm-btn"),
};

// Feedback playback timing (spec §9.3): the guess, a beat, then the answer.
const GUESS_DURATION = 1.0;
const GUESS_GAP = 0.5;
const TONIC_DURATION = 1.0;
const TONIC_GAP = 0.35;
const PRESS_DURATION = 0.6;

// Free Play (spec §9.5). The octave range stops short of the piano's extremes
// in both directions: below C2 the voice's sub-oscillator drops under 30 Hz
// and turns to rumble, above B6 the triangle is pure whistle.
const MIN_OCTAVE = 2;
const MAX_OCTAVE = 6;
const FREE_NOTE_DURATION = { short: 0.7, long: 2.4 };

const settings = storage.loadSettings();

let keyboard = null;
let freeKeyboard = null;
let session = null;
let generator = null;
let sessionActive = false;
let answered = false;
let replays = 0;
let questionNumber = 1;
let timerId = null;
let remainingSeconds = 0;
let totalSeconds = 0;
// Bumped whenever playback is abandoned, so scheduled key flashes from an
// old question can never light up the next one's keyboard.
let audioToken = 0;

// ---------- Audio helpers ----------

function stopAudio() {
  audioToken++;
  AudioEngine.stopAll();
}

// One flasher per playback gesture; guess-then-answer shares a single token
// so the earlier half is not invalidated by scheduling the later half.
function newPlayback() {
  const token = ++audioToken;
  return (midi) => {
    if (token === audioToken && keyboard) keyboard.flash(midi);
  };
}

function updateAudioNotice() {
  const blocked = AudioEngine.getState() === "suspended";
  els.audioNotice.classList.toggle("hidden", !blocked);
}

async function ensureAudio() {
  const ready = await AudioEngine.resume();
  updateAudioNotice();
  return ready;
}

els.audioNotice.addEventListener("click", async () => {
  await ensureAudio();
  if (AudioEngine.isReady()) AudioEngine.playNote(midiForPc(0), { duration: 0.5 });
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) updateAudioNotice();
});

// ---------- Setup screen ----------

function showScreen(name) {
  Object.entries(els.screens).forEach(([key, el]) => {
    el.classList.toggle("hidden", key !== name);
  });
  // The full title band costs a phone most of its first screen, so it shrinks
  // out of the keyboard's way whenever a keyboard is up.
  document.body.classList.toggle("is-playing", name === "question" || name === "freeplay");
  // Both keyboards listen for the shortcut row on `document`, so the one that
  // is off-screen has to be deafened; whichever screen is being entered turns
  // its own keyboard back on.
  if (name !== "question" && keyboard) keyboard.setEnabled(false);
  if (name !== "freeplay" && freeKeyboard) freeKeyboard.setEnabled(false);
  // Start sits at the bottom of a long setup panel; without this the question
  // screen opens halfway down the page.
  window.scrollTo(0, 0);
}

function bindToggleGroup(container, selector, initial, onChange) {
  const buttons = Array.from(container.querySelectorAll(selector));

  function setActive(value) {
    buttons.forEach((btn) => {
      const active = btn.dataset.value === String(value);
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setActive(btn.dataset.value);
      onChange(btn.dataset.value);
    });
  });

  setActive(initial);
  return setActive;
}

function updateSetupInfo() {
  els.poolSummary.textContent = POOL_SUMMARY[settings.mode][settings.difficulty];
  ui.renderStatLine(
    els.statLine,
    storage.getBestFor(settings),
    storage.getLastFor(settings),
    settings.lengthType,
    settings.lengthValue
  );
}

function persist() {
  storage.saveSettings(settings);
}

function renderLengthValues() {
  const options = ui.LENGTH_OPTIONS[settings.lengthType];
  if (!options.includes(settings.lengthValue)) {
    settings.lengthValue = settings.lengthType === "timed" ? 3 : 10;
  }
  ui.renderLengthOptions(els.lengthValueGroup, settings.lengthType, settings.lengthValue, (value) => {
    settings.lengthValue = value;
    renderLengthValues();
    updateSetupInfo();
    persist();
  });
}

bindToggleGroup(els.modeGroup, ".mode-btn", settings.mode, (value) => {
  settings.mode = value;
  updateSetupInfo();
  persist();
});

bindToggleGroup(els.difficultyGroup, ".toggle-btn", settings.difficulty, (value) => {
  settings.difficulty = value;
  updateSetupInfo();
  persist();
});

bindToggleGroup(els.lengthTypeGroup, ".toggle-btn", settings.lengthType, (value) => {
  settings.lengthType = value;
  renderLengthValues();
  updateSetupInfo();
  persist();
});

const setStyleActive = bindToggleGroup(els.styleGroup, ".toggle-btn", settings.chordStyle, (value) => {
  settings.chordStyle = value;
  persist();
});

// One volume, two sliders: the setup screen's and Free Play's own, which is
// there because Free Play is reachable without passing through setup twice.
function applyVolume(percent) {
  const value = Math.min(100, Math.max(0, Number(percent)));
  settings.volume = value / 100;
  const text = `${Math.round(value)}%`;
  els.volume.value = String(value);
  els.volumeValue.textContent = text;
  els.freeVolume.value = String(value);
  els.freeVolumeValue.textContent = text;
  AudioEngine.setVolume(settings.volume);
}

els.volume.addEventListener("input", (event) => applyVolume(event.target.value));
els.volume.addEventListener("change", persist);
els.freeVolume.addEventListener("input", (event) => applyVolume(event.target.value));
els.freeVolume.addEventListener("change", persist);

// Worth having before the session starts, so nobody discovers their volume is
// muted on question 1 (spec §9.1).
els.testSoundBtn.addEventListener("click", async () => {
  await ensureAudio();
  AudioEngine.playChord([60, 64, 67], { style: "arpeggio", duration: 1.0 });
});

els.shortcutLabels.addEventListener("change", (event) => {
  settings.showShortcuts = event.target.checked;
  if (keyboard) keyboard.setShortcutLabels(settings.showShortcuts);
  if (freeKeyboard) freeKeyboard.setShortcutLabels(settings.showShortcuts);
  persist();
});

// ---------- Keyboard component ----------

keyboard = createKeyboard(els.keyboard, {
  mode: "single",
  onKeyPress: (pc) => {
    AudioEngine.playNote(midiForPc(pc), { duration: PRESS_DURATION });
    keyboard.flash(pc);
  },
  onSelectionChange: updateSelectionState,
});

function expectedNoteCount() {
  const question = session && session.currentQuestion;
  return question ? question.answerPcs.length : 1;
}

function updateSelectionState(selection) {
  if (!sessionActive || answered) return;
  const expected = expectedNoteCount();

  if (settings.mode === "note") {
    els.selectionCounter.textContent = selection.length
      ? `${bothNames(selection[0])} selected`
      : "Click the key you heard";
  } else {
    els.selectionCounter.textContent = `${selection.length} of ${expected} notes selected`;
  }

  // Submit stays disabled until at least the expected number of notes is
  // selected, so nobody submits a half-built chord by accident (spec §7).
  els.checkBtn.disabled = selection.length < expected;
}

// ---------- Free play (spec §9.5) ----------

// A second instance rather than a relocated one: the game's keyboard keeps
// its selection, its marks and its C4 base while Free Play roams octaves.
freeKeyboard = createKeyboard(els.freeKeyboard, {
  mode: "free",
  announceOctave: true,
  baseMidi: baseMidiFor(settings.freeOctave),
  onKeyPress: (pc, midi) => {
    AudioEngine.playNote(midi, { duration: FREE_NOTE_DURATION[settings.freeNoteLength] });
    freeKeyboard.flash(pc);
    els.freeReadout.textContent = bothNamesWithOctave(pc, octaveOf(midi));
  },
});

function baseMidiFor(octave) {
  return (octave + 1) * 12; // C4 is MIDI 60
}

function renderOctave() {
  const octave = settings.freeOctave;
  freeKeyboard.setBaseMidi(baseMidiFor(octave));
  els.octaveDisplay.textContent = `Octave ${octave} · C${octave}–B${octave}`;
  els.octaveDownBtn.disabled = octave <= MIN_OCTAVE;
  els.octaveUpBtn.disabled = octave >= MAX_OCTAVE;
}

// Notes already ringing are left alone: they were played in the old octave
// and cutting them off mid-decay sounds like a fault, not a control.
function shiftOctave(delta) {
  const next = Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, settings.freeOctave + delta));
  if (next === settings.freeOctave) return;
  settings.freeOctave = next;
  renderOctave();
  els.freeReadout.textContent = `Octave ${next}`;
  persist();
}

bindToggleGroup(els.freeSustainGroup, ".toggle-btn", settings.freeNoteLength, (value) => {
  settings.freeNoteLength = value;
  persist();
});

els.octaveDownBtn.addEventListener("click", () => shiftOctave(-1));
els.octaveUpBtn.addEventListener("click", () => shiftOctave(1));

async function enterFreePlay() {
  showScreen("freeplay");
  freeKeyboard.setShortcutLabels(settings.showShortcuts);
  freeKeyboard.setEnabled(true);
  renderOctave();
  els.freeReadout.textContent = "Play a key";
  await ensureAudio();
}

function leaveFreePlay() {
  stopAudio();
  showScreen("setup");
  updateSetupInfo();
}

els.freePlayBtn.addEventListener("click", () => enterFreePlay());
els.freeBackBtn.addEventListener("click", leaveFreePlay);

// ---------- Question playback ----------

function chordStyleFor(question) {
  return question.type === "chordEar" ? settings.chordStyle : "block";
}

function playTarget({ when = 0, flash = null } = {}) {
  const question = session.currentQuestion;
  if (!question) return 0;

  if (question.type === "note") {
    return AudioEngine.playNote(question.targetMidi, {
      when,
      duration: NOTE_DURATION,
      onNote: flash,
    });
  }
  return AudioEngine.playChord(question.voicing, {
    when,
    style: chordStyleFor(question),
    duration: CHORD_DURATION,
    onNote: flash,
  });
}

function playReference() {
  const question = session && session.currentQuestion;
  if (!question || question.tonicMidi === undefined) return;
  AudioEngine.playNote(question.tonicMidi, { duration: TONIC_DURATION });
}

// The reference tonic first, then the target: every ear question is answered
// by interval, not absolute pitch (spec §1). Keys are not flashed here — that
// would hand over the answer.
function playQuestion({ withReference = true } = {}) {
  const question = session.currentQuestion;
  if (!question || !MODES[question.type].hasAudioPrompt) return;

  stopAudio();
  if (withReference && question.tonicMidi !== undefined) {
    AudioEngine.playNote(question.tonicMidi, { duration: TONIC_DURATION });
    playTarget({ when: TONIC_DURATION + TONIC_GAP });
  } else {
    playTarget();
  }
}

els.replayBtn.addEventListener("click", () => {
  if (!sessionActive || answered) return;
  replays++;
  stopAudio();
  playTarget();
});

els.referenceBtn.addEventListener("click", () => {
  if (!sessionActive || answered) return;
  stopAudio();
  playReference();
});

// ---------- Session flow ----------

function sessionSettings() {
  return {
    mode: settings.mode,
    difficulty: settings.difficulty,
    lengthType: settings.lengthType,
    lengthValue: settings.lengthValue,
  };
}

async function beginSession() {
  await ensureAudio();

  generator = createGenerator(settings.mode, settings.difficulty);
  session = game.createSession(sessionSettings());
  sessionActive = true;

  keyboard.setMode(settings.mode === "note" ? "single" : "multi");
  keyboard.setShortcutLabels(settings.showShortcuts);
  els.shortcutLegend.classList.toggle("hidden", Boolean(settings.legendDismissed));

  showScreen("question");
  updateStreak();

  if (settings.lengthType === "timed") {
    startTimer(settings.lengthValue * 60);
  } else {
    stopTimer();
    els.timerBar.classList.add("hidden");
  }

  nextQuestion();
}

function nextQuestion() {
  if (!sessionActive) return;
  if (settings.lengthType === "count" && game.isSessionDone(session)) {
    finishSession();
    return;
  }

  stopAudio();
  answered = false;
  replays = 0;

  const question = generator.next();
  session.currentQuestion = question;
  // Captured now so feedback keeps naming the question on screen, even as the
  // timed clock ticks the header along beside it.
  questionNumber = session.askedCount + 1;

  keyboard.clearMarks();
  keyboard.clearSelection();
  keyboard.setEnabled(true);

  if (MODES[question.type].hasAudioPrompt && AudioEngine.getState() === "suspended") {
    ensureAudio();
  }

  els.feedback.classList.add("hidden");
  els.feedback.classList.remove("feedback--correct", "feedback--incorrect");
  els.keyLegend.classList.add("hidden");
  els.selectionCounter.classList.remove("hidden");
  els.playActions.classList.remove("hidden");
  els.checkBtn.disabled = true;

  renderPrompt(question);
  updateProgress();
  updateSelectionState([]);

  playQuestion();
}

function renderPrompt(question) {
  const isBuild = question.type === "chordBuild";

  els.audioControls.classList.toggle("hidden", isBuild);
  els.styleGroup.classList.toggle("hidden", question.type !== "chordEar");
  els.promptChord.classList.toggle("hidden", !isBuild);
  setStyleActive(settings.chordStyle);

  if (question.type === "note") {
    els.promptQuestion.textContent = "What note is this?";
  } else if (question.type === "chordEar") {
    els.promptQuestion.textContent = "Which notes are in this chord?";
  } else {
    els.promptQuestion.textContent = "Build this chord:";
    els.promptChord.textContent = question.label;
  }
}

function updateProgress() {
  if (settings.lengthType === "count") {
    els.progressIndicator.textContent = `Question ${questionNumber} of ${settings.lengthValue}`;
  } else {
    els.progressIndicator.textContent = `${ui.formatClock(remainingSeconds)} · question ${questionNumber}`;
  }
}

function updateStreak() {
  els.streakIndicator.textContent = session && session.streak >= 2 ? `🔥 ${session.streak}` : "";
}

// ---------- Timer (spec §3.3, §3.4) ----------

function startTimer(seconds) {
  stopTimer();
  totalSeconds = seconds;
  remainingSeconds = seconds;
  els.timerBar.classList.remove("hidden");
  updateTimerBar();

  timerId = setInterval(() => {
    remainingSeconds--;
    updateTimerBar();
    updateProgress();
    if (remainingSeconds <= 0) {
      stopTimer();
      endSessionOnTime();
    }
  }, 1000);
}

function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}

function updateTimerBar() {
  const ratio = totalSeconds ? Math.max(0, remainingSeconds) / totalSeconds : 0;
  els.timerFill.style.width = `${ratio * 100}%`;
  els.timerBar.classList.toggle("is-low", remainingSeconds <= 10);
}

// A question still on screen when the clock expires is marked unanswered and
// excluded from accuracy (spec §3.4).
function endSessionOnTime() {
  if (!sessionActive) return;
  if (!answered && session.currentQuestion) {
    game.recordUnanswered(session, session.currentQuestion, {
      submitted: keyboard.getSelection(),
      replays,
    });
  }
  finishSession();
}

// ---------- Answering ----------

function submitAnswer() {
  if (!sessionActive || answered) return;
  const submitted = keyboard.getSelection();
  if (submitted.length < expectedNoteCount()) return;

  answered = true;
  const question = session.currentQuestion;
  const outcome = game.recordAnswer(session, question, submitted, { replays });

  keyboard.setEnabled(false);
  keyboard.markResult({
    correct: outcome.correctPcs,
    wrong: outcome.wrongPcs,
    missed: outcome.missedPcs,
  });

  showFeedback(question, outcome, submitted);
  updateStreak();
}

function answerSummaryText(question) {
  if (question.type === "note") return `That was ${bothNames(question.targetPc)}.`;
  return `That was ${question.label} — ${question.answer.join(" ")}.`;
}

function showFeedback(question, outcome, submitted) {
  els.playActions.classList.add("hidden");
  els.feedback.classList.remove("hidden");
  els.feedback.classList.toggle("feedback--correct", outcome.correct);
  els.feedback.classList.toggle("feedback--incorrect", !outcome.correct);
  els.keyLegend.classList.toggle("hidden", outcome.correct);

  els.feedbackStatus.textContent = outcome.correct ? "✓ Correct!" : "✕ Not quite";
  els.feedbackAnswer.textContent = answerSummaryText(question);
  els.feedbackTeach.textContent =
    question.type === "note"
      ? noteTeachingNote(question.tonicPc, question.targetPc)
      : chordTeachingNote(question.rootPc, question.quality);

  els.selectionCounter.textContent = outcome.correct ? "" : `You picked ${ui.namesFor(submitted)}`;
  els.selectionCounter.classList.toggle("hidden", outcome.correct);

  if (!outcome.correct) {
    els.playPanel.classList.remove("shake");
    void els.playPanel.offsetWidth;
    els.playPanel.classList.add("shake");
  }

  playFeedbackAudio(question, outcome, submitted);
  els.nextBtn.focus();
}

// The single most important learning mechanic: a wrong answer plays the
// guess first, then the right answer, so the difference is audible (spec §2).
function playFeedbackAudio(question, outcome, submitted) {
  stopAudio();
  const flash = newPlayback();

  if (outcome.correct) {
    playTarget({ flash });
    return;
  }

  const style = chordStyleFor(question);
  if (question.type === "note") {
    AudioEngine.playNote(midiForPc(submitted[0]), { duration: GUESS_DURATION, onNote: flash });
  } else {
    AudioEngine.playChord(voicePcs(submitted), {
      style,
      duration: GUESS_DURATION,
      onNote: flash,
    });
  }

  playTarget({ when: GUESS_DURATION + GUESS_GAP, flash });
}

els.checkBtn.addEventListener("click", submitAnswer);
els.nextBtn.addEventListener("click", () => nextQuestion());

// ---------- Quit (spec §3.4) ----------

function openQuitModal() {
  if (!sessionActive) return;
  els.quitModal.classList.remove("hidden");
  els.quitCancelBtn.focus();
}

function closeQuitModal() {
  els.quitModal.classList.add("hidden");
}

els.quitBtn.addEventListener("click", openQuitModal);
els.quitCancelBtn.addEventListener("click", closeQuitModal);
els.quitModal.addEventListener("click", (event) => {
  if (event.target === els.quitModal) closeQuitModal();
});

// Quitting discards the session — it is not saved to history.
els.quitConfirmBtn.addEventListener("click", () => {
  closeQuitModal();
  sessionActive = false;
  stopTimer();
  stopAudio();
  keyboard.clearMarks();
  keyboard.clearSelection();
  showScreen("setup");
  updateSetupInfo();
});

els.dismissLegendBtn.addEventListener("click", () => {
  settings.legendDismissed = true;
  els.shortcutLegend.classList.add("hidden");
  persist();
});

// ---------- Results (spec §9.4) ----------

function finishSession() {
  if (!sessionActive) return;
  sessionActive = false;
  stopTimer();
  stopAudio();

  const summary = game.computeSummary(session);
  storage.saveSessionResult({
    timestamp: Date.now(),
    ...sessionSettings(),
    correct: summary.correct,
    total: summary.total,
    unanswered: summary.unanswered,
    accuracy: summary.accuracy,
    bestStreak: summary.bestStreak,
  });

  ui.renderResults(els, summary, session.settings);
  ui.renderReview(els.reviewList, session, (result) => {
    stopAudio();
    const q = result.question;
    if (q.type === "note") {
      AudioEngine.playNote(q.targetMidi, { duration: NOTE_DURATION });
    } else {
      AudioEngine.playChord(q.voicing, { style: chordStyleFor(q), duration: CHORD_DURATION });
    }
  });

  showScreen("results");
  els.playAgainBtn.focus();
}

els.startBtn.addEventListener("click", () => beginSession());
els.playAgainBtn.addEventListener("click", () => beginSession());
els.newSessionBtn.addEventListener("click", () => {
  stopAudio();
  showScreen("setup");
  updateSetupInfo();
});

// ---------- Global shortcuts (spec §8) ----------

document.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key === "Escape" && !els.quitModal.classList.contains("hidden")) {
    event.preventDefault();
    closeQuitModal();
    return;
  }
  if (!els.quitModal.classList.contains("hidden")) return;

  const field = document.activeElement;
  const typing =
    field instanceof HTMLElement &&
    (field.tagName === "INPUT" || field.tagName === "TEXTAREA" || field.isContentEditable);

  if (!els.screens.freeplay.classList.contains("hidden")) {
    if (event.key === "Escape") {
      event.preventDefault();
      leaveFreePlay();
      return;
    }
    // The note keys are the keyboard component's; only the octave is ours.
    const shift = { z: -1, x: 1 }[event.key.toLowerCase()];
    if (shift && !typing) {
      event.preventDefault();
      shiftOctave(shift);
    }
    return;
  }

  if (els.screens.question.classList.contains("hidden")) return;

  const active = document.activeElement;
  const onPianoKey = active instanceof HTMLElement && active.classList.contains("key");

  if (event.key === " " || event.code === "Space") {
    // A focused piano key keeps Space for itself — it is a playable key.
    if (onPianoKey) return;
    event.preventDefault();
    if (!answered && !els.audioControls.classList.contains("hidden")) els.replayBtn.click();
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    if (answered) els.nextBtn.click();
    else if (!els.checkBtn.disabled) submitAnswer();
    return;
  }

  if (event.key.toLowerCase() === "r") {
    if (!els.audioControls.classList.contains("hidden")) {
      event.preventDefault();
      els.referenceBtn.click();
    }
  }
});

// ---------- Boot ----------

applyVolume(Math.round(settings.volume * 100));
els.shortcutLabels.checked = settings.showShortcuts;
keyboard.setShortcutLabels(settings.showShortcuts);
freeKeyboard.setShortcutLabels(settings.showShortcuts);
settings.freeOctave = Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, Number(settings.freeOctave) || 4));
renderOctave();
renderLengthValues();
updateSetupInfo();
updateSelectionState([]);
showScreen("setup");
