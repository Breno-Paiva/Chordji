// DOM rendering helpers. No app state lives here — callers pass data in and
// wire up their own handlers.

import { SHARP_NAMES, bothNames, pitchClass } from "./theory.js";

export const LENGTH_OPTIONS = {
  count: [5, 10, 20],
  timed: [1, 3, 5],
};

const ORDINALS = ["root position", "1st inversion", "2nd inversion", "3rd inversion"];

export function formatLength(lengthType, value) {
  if (lengthType === "timed") return `${value} minute${value === 1 ? "" : "s"}`;
  return `${value} questions`;
}

export function formatClock(seconds) {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function namesFor(pcs) {
  if (!pcs.length) return "nothing";
  return pcs.map((pc) => SHARP_NAMES[pitchClass(pc)]).join(" ");
}

// Count and Timed share one row of buttons; only the values change.
export function renderLengthOptions(container, lengthType, current, onChange) {
  container.innerHTML = "";
  container.setAttribute("aria-label", lengthType === "timed" ? "Minutes" : "Questions");

  LENGTH_OPTIONS[lengthType].forEach((value) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toggle-btn";
    btn.dataset.value = String(value);
    btn.textContent = lengthType === "timed" ? `${value} min` : String(value);
    const active = value === current;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    btn.addEventListener("click", () => onChange(value));
    container.appendChild(btn);
  });
}

export function renderStatLine(el, best, last, lengthType, lengthValue) {
  const parts = [];
  if (best) parts.push(`Best ${best.accuracy}%`);
  if (last) parts.push(`Last ${last.accuracy}%`);
  el.textContent = parts.length
    ? `${formatLength(lengthType, lengthValue)} · ${parts.join(" · ")}`
    : `No sessions yet for this combination — ${formatLength(lengthType, lengthValue)} coming up.`;
}

// A short description of what a question asked, used in the review list.
export function describeQuestion(question) {
  if (question.type === "note") return bothNames(question.targetPc);
  return question.label;
}

function describeMeta(result) {
  const q = result.question;
  const bits = [];
  if (q.type === "note") bits.push(`tonic ${SHARP_NAMES[pitchClass(q.tonicPc)]}`);
  if (q.type === "chordEar") bits.push(ORDINALS[q.inversion] || "root position");
  // Build the Chord needs no per-row note: the mode is fixed for the session.
  if (result.replays) bits.push(`${result.replays} replay${result.replays === 1 ? "" : "s"}`);
  return bits.join(" · ");
}

export function renderResults(els, summary, settings) {
  els.resultsSummary.innerHTML = "";

  const accuracy = document.createElement("div");
  accuracy.className = "results-accuracy";
  accuracy.textContent = `${summary.accuracy}%`;

  const sub = document.createElement("div");
  sub.className = "results-sub";
  sub.textContent = `${summary.correct} / ${summary.total} correct`;

  const chips = document.createElement("div");
  chips.className = "results-chips";

  const addChip = (label) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = label;
    chips.appendChild(chip);
  };
  addChip(`Best streak ${summary.bestStreak}`);
  addChip(formatLength(settings.lengthType, settings.lengthValue));
  if (summary.unanswered) addChip(`${summary.unanswered} unanswered`);

  els.resultsSummary.append(accuracy, sub, chips);

  if (summary.mostMissed) {
    els.mostMissed.textContent = `Most missed: ${summary.mostMissed.label} — ${summary.mostMissed.wrong} of ${summary.mostMissed.total} wrong.`;
    els.mostMissed.classList.remove("hidden");
  } else {
    els.mostMissed.textContent = "";
    els.mostMissed.classList.add("hidden");
  }
}

// Per-question review with a play button on every row (spec §9.4).
export function renderReview(listEl, session, onPlay) {
  listEl.innerHTML = "";

  session.results.forEach((result, index) => {
    const q = result.question;
    const state = result.unanswered ? "unanswered" : result.correct ? "correct" : "incorrect";

    const li = document.createElement("li");
    li.className = `review-item review-${state}`;

    const icon = document.createElement("span");
    icon.className = "review-icon";
    icon.textContent = result.unanswered ? "–" : result.correct ? "✓" : "✕";
    icon.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    body.className = "review-body";

    const head = document.createElement("div");
    head.className = "review-head";

    const title = document.createElement("span");
    title.className = "review-title";
    title.textContent = `${index + 1}. ${describeQuestion(q)}`;

    const meta = document.createElement("span");
    meta.className = "review-meta";
    meta.textContent = describeMeta(result);

    head.append(title, meta);

    const detail = document.createElement("div");
    detail.className = "review-detail";
    const answerText = q.answer.join(" ");
    if (result.unanswered) {
      detail.textContent = `Ran out of time · answer: ${answerText}`;
    } else if (result.correct) {
      detail.textContent = `Answer: ${answerText}`;
    } else {
      detail.textContent = `You picked ${namesFor(result.submitted)} · answer: ${answerText}`;
    }

    body.append(head, detail);

    const play = document.createElement("button");
    play.type = "button";
    play.className = "btn btn-icon review-play";
    play.textContent = "▶";
    play.setAttribute("aria-label", `Play ${describeQuestion(q)} again`);
    play.addEventListener("click", () => onPlay(result));

    li.append(icon, body, play);
    listEl.appendChild(li);
  });
}
