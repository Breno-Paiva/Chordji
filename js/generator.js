// Procedural question generation (spec §6). There is no authored question
// bank — questions come from theory rules, so content is effectively
// infinite and there are no data files to load.

import {
  CHORD_QUALITIES,
  KEYBOARD_BASE_MIDI,
  chordLabel,
  chordPcs,
  chordSymbol,
  midiForPc,
  spellChord,
  voiceChord,
  bothNames,
} from "./theory.js";

export const MODES = {
  note: {
    id: "note",
    name: "Name That Note",
    blurb: "A reference tonic plays, then one note. Click the note you heard.",
    skill: "Relative-pitch ear",
    hasAudioPrompt: true,
  },
  chordEar: {
    id: "chordEar",
    name: "Hear the Chord",
    blurb: "A chord plays. Click every note in it.",
    skill: "Chord ear",
    hasAudioPrompt: true,
  },
  chordBuild: {
    id: "chordBuild",
    name: "Build the Chord",
    blurb: "A chord name appears. Click the notes that build it.",
    skill: "Chord theory",
    hasAudioPrompt: false,
  },
};

const NATURALS = [0, 2, 4, 5, 7, 9, 11];
const CHROMATIC = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// What each difficulty draws from (spec §4).
const POOLS = {
  note: {
    easy: { notes: NATURALS, movingTonic: false },
    medium: { notes: CHROMATIC, movingTonic: false },
    hard: { notes: CHROMATIC, movingTonic: true },
  },
  chord: {
    easy: { roots: NATURALS, maxTier: 1, invert: false, movingTonic: false },
    medium: { roots: CHROMATIC, maxTier: 2, invert: false, movingTonic: false },
    hard: { roots: CHROMATIC, maxTier: 3, invert: true, movingTonic: true },
  },
};

// One-line pool summaries for the setup screen (spec §9.1).
export const POOL_SUMMARY = {
  note: {
    easy: "The 7 naturals of C major, tonic always C",
    medium: "All 12 chromatic notes, tonic always C",
    hard: "All 12 chromatic notes, tonic moves every question",
  },
  chordEar: {
    easy: "Major and minor triads on natural roots",
    medium: "+ diminished, augmented, sus2, sus4 · all 12 roots",
    hard: "+ 7th chords · all 12 roots · inversions",
  },
  chordBuild: {
    easy: "Major and minor triads on natural roots",
    medium: "+ diminished, augmented, sus2, sus4 · all 12 roots",
    hard: "+ 7th chords · all 12 roots",
  },
};

const REPEAT_WINDOW = 3;
const MAX_ATTEMPTS = 60;

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function qualitiesUpTo(maxTier) {
  return Object.values(CHORD_QUALITIES)
    .filter((q) => q.tier <= maxTier)
    .map((q) => q.id);
}

function makeNoteQuestion(pool) {
  const tonicPc = pool.movingTonic ? pick(CHROMATIC) : 0;
  const targetPc = pick(pool.notes);
  return {
    type: "note",
    tonicPc,
    tonicMidi: midiForPc(tonicPc),
    targetPc,
    // Always sounded inside the octave the keyboard shows, so octave
    // discrimination is never part of the answer (spec §4.1).
    targetMidi: midiForPc(targetPc),
    answerPcs: [targetPc],
    answer: [bothNames(targetPc)],
    signature: `note:${targetPc}@${tonicPc}`,
  };
}

function makeChordQuestion(type, pool) {
  const rootPc = pick(pool.roots);
  const qualityId = pick(qualitiesUpTo(pool.maxTier));
  const size = CHORD_QUALITIES[qualityId].offsets.length;

  // Inversions belong to the ear mode: they make the ear work harder without
  // touching the answer (spec §4.2). Build the Chord never asks for an
  // inversion, so its feedback plays the chord as the player stacked it.
  const inversion =
    pool.invert && type === "chordEar" ? Math.floor(Math.random() * size) : 0;

  const tonicPc = pool.movingTonic ? pick(CHROMATIC) : 0;
  const question = {
    type,
    rootPc,
    quality: qualityId,
    inversion,
    voicing: voiceChord(rootPc, qualityId, inversion, KEYBOARD_BASE_MIDI),
    answerPcs: chordPcs(rootPc, qualityId),
    answer: spellChord(rootPc, qualityId),
    label: chordLabel(rootPc, qualityId),
    symbol: chordSymbol(rootPc, qualityId),
    signature: `${type}:${rootPc}:${qualityId}`,
  };

  if (type === "chordEar") {
    question.tonicPc = tonicPc;
    question.tonicMidi = midiForPc(tonicPc);
  }
  return question;
}

export function generateQuestion(mode, difficulty) {
  if (mode === "note") return makeNoteQuestion(POOLS.note[difficulty]);
  return makeChordQuestion(mode, POOLS.chord[difficulty]);
}

// Rejects anything matching the previous few questions so a short session
// does not repeat itself (spec §3.3).
export function createGenerator(mode, difficulty) {
  const recent = [];

  return {
    next() {
      let question = generateQuestion(mode, difficulty);
      let attempts = 0;
      while (recent.includes(question.signature) && attempts < MAX_ATTEMPTS) {
        question = generateQuestion(mode, difficulty);
        attempts++;
      }
      recent.push(question.signature);
      if (recent.length > REPEAT_WINDOW) recent.shift();
      return question;
    },
  };
}
