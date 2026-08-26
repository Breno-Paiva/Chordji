// Session state machine, answer validation and scoring (spec §3, §7).
// Pure data in, pure data out — no DOM, no audio.

import { CHORD_QUALITIES, bothNames, normalizePcs, pcSetsEqual } from "./theory.js";

export function createSession(settings) {
  return {
    settings,
    results: [],
    currentQuestion: null,
    askedCount: 0,
    unansweredCount: 0,
    streak: 0,
    bestStreak: 0,
    startedAt: Date.now(),
  };
}

// Both chord modes compare pitch-class *sets*: order is irrelevant and there
// is no partial credit — a 3-of-4 answer is wrong (spec §7). The breakdown is
// still returned so feedback can show exactly which note was missed.
export function evaluate(question, submittedPcs) {
  const submitted = normalizePcs(submittedPcs);
  const answer = normalizePcs(question.answerPcs);
  return {
    correct: pcSetsEqual(submitted, answer),
    correctPcs: submitted.filter((pc) => answer.includes(pc)),
    wrongPcs: submitted.filter((pc) => !answer.includes(pc)),
    missedPcs: answer.filter((pc) => !submitted.includes(pc)),
  };
}

export function recordAnswer(session, question, submittedPcs, meta = {}) {
  const outcome = evaluate(question, submittedPcs);

  session.results.push({
    question,
    submitted: normalizePcs(submittedPcs),
    correct: outcome.correct,
    replays: meta.replays || 0,
  });
  session.askedCount++;
  session.streak = outcome.correct ? session.streak + 1 : 0;
  session.bestStreak = Math.max(session.bestStreak, session.streak);

  return outcome;
}

// Timed mode can expire with a question on screen: it is marked unanswered
// and excluded from accuracy (spec §3.4).
export function recordUnanswered(session, question, meta = {}) {
  session.results.push({
    question,
    submitted: normalizePcs(meta.submitted || []),
    correct: false,
    unanswered: true,
    replays: meta.replays || 0,
  });
  session.unansweredCount++;
  session.streak = 0;
}

export function isSessionDone(session) {
  if (session.settings.lengthType === "count") {
    return session.askedCount >= session.settings.lengthValue;
  }
  return false; // timed sessions end on the clock, not the question count
}

// The group the player got wrong most often — chord quality in the chord
// modes, note name in Name That Note. "Most often" needs repetition to mean
// anything, so a single miss is not reported (spec §9.4).
function computeMostMissed(session) {
  const groups = new Map();

  session.results.forEach((result) => {
    if (result.unanswered) return;
    const q = result.question;
    const label =
      q.type === "note"
        ? bothNames(q.targetPc)
        : `${CHORD_QUALITIES[q.quality].name} chords`;

    const group = groups.get(label) || { label, wrong: 0, total: 0 };
    group.total++;
    if (!result.correct) group.wrong++;
    groups.set(label, group);
  });

  const ranked = [...groups.values()]
    .filter((group) => group.wrong >= 2)
    .sort((a, b) => b.wrong - a.wrong || b.total - a.total);

  return ranked[0] || null;
}

export function computeSummary(session) {
  const answered = session.results.filter((result) => !result.unanswered);
  const correct = answered.filter((result) => result.correct).length;
  const total = answered.length;

  return {
    correct,
    total,
    unanswered: session.unansweredCount,
    accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
    bestStreak: session.bestStreak,
    mostMissed: computeMostMissed(session),
  };
}
