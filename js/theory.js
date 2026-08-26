// Note and chord math (spec §6, §7). Pure functions over integers — no DOM,
// no audio, no module state. This is the one file with right and wrong
// answers independent of the UI, which is what makes it testable.

// ---------- Pitch classes ----------

// The keyboard always shows one octave starting at C4, and every answer is a
// pitch class, so octave is never part of a comparison (spec §4.1).
export const KEYBOARD_BASE_MIDI = 60;

export const SHARP_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
export const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

export function pitchClass(midi) {
  return ((midi % 12) + 12) % 12;
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// The MIDI note for a pitch class inside the displayed octave.
export function midiForPc(pc, base = KEYBOARD_BASE_MIDI) {
  return base + pitchClass(pc);
}

export function isBlackKey(pc) {
  return [1, 3, 6, 8, 10].includes(pitchClass(pc));
}

// Key caps show sharps only — "C#/Db" is unreadable at 360px (spec §6).
export function keyLabel(pc) {
  return SHARP_NAMES[pitchClass(pc)];
}

// The flat name rides along in the aria-label instead.
export function ariaNoteName(pc) {
  const p = pitchClass(pc);
  if (!isBlackKey(p)) return SHARP_NAMES[p];
  return `${SHARP_NAMES[p][0]} sharp, also ${FLAT_NAMES[p][0]} flat`;
}

// Prose (feedback, review rows) can afford both spellings; key caps cannot.
export function bothNames(pc) {
  const p = pitchClass(pc);
  return isBlackKey(p) ? `${SHARP_NAMES[p]} / ${FLAT_NAMES[p]}` : SHARP_NAMES[p];
}

// ---------- Intervals ----------

export const INTERVAL_NAMES = [
  "unison",
  "minor 2nd",
  "major 2nd",
  "minor 3rd",
  "major 3rd",
  "perfect 4th",
  "tritone",
  "perfect 5th",
  "minor 6th",
  "major 6th",
  "minor 7th",
  "major 7th",
];

export function intervalSemitones(fromPc, toPc) {
  return (pitchClass(toPc) - pitchClass(fromPc) + 12) % 12;
}

// ---------- Chord formulas (spec §4.2) ----------

// `degrees` runs alongside `offsets` and drives enharmonic spelling: it says
// which scale degree each tone is, so the speller knows which letter to use.
export const CHORD_QUALITIES = {
  major: { id: "major", symbol: "", name: "major", offsets: [0, 4, 7], degrees: [1, 3, 5], tier: 1 },
  minor: { id: "minor", symbol: "m", name: "minor", offsets: [0, 3, 7], degrees: [1, 3, 5], tier: 1 },
  dim: { id: "dim", symbol: "dim", name: "diminished", offsets: [0, 3, 6], degrees: [1, 3, 5], tier: 2 },
  aug: { id: "aug", symbol: "aug", name: "augmented", offsets: [0, 4, 8], degrees: [1, 3, 5], tier: 2 },
  sus2: { id: "sus2", symbol: "sus2", name: "sus2", offsets: [0, 2, 7], degrees: [1, 2, 5], tier: 2 },
  sus4: { id: "sus4", symbol: "sus4", name: "sus4", offsets: [0, 5, 7], degrees: [1, 4, 5], tier: 2 },
  maj7: { id: "maj7", symbol: "maj7", name: "major 7", offsets: [0, 4, 7, 11], degrees: [1, 3, 5, 7], tier: 3 },
  m7: { id: "m7", symbol: "m7", name: "minor 7", offsets: [0, 3, 7, 10], degrees: [1, 3, 5, 7], tier: 3 },
  dom7: { id: "dom7", symbol: "7", name: "dominant 7", offsets: [0, 4, 7, 10], degrees: [1, 3, 5, 7], tier: 3 },
  m7b5: { id: "m7b5", symbol: "m7♭5", name: "half-diminished 7", offsets: [0, 3, 6, 10], degrees: [1, 3, 5, 7], tier: 3 },
  dim7: { id: "dim7", symbol: "dim7", name: "diminished 7", offsets: [0, 3, 6, 9], degrees: [1, 3, 5, 7], tier: 3 },
};

export function quality(id) {
  const q = CHORD_QUALITIES[id];
  if (!q) throw new Error(`Unknown chord quality: ${id}`);
  return q;
}

// The pitch-class set that *is* the answer, whatever the voicing (spec §4.2).
export function chordPcs(rootPc, qualityId) {
  return quality(qualityId).offsets.map((o) => pitchClass(rootPc + o));
}

// ---------- Enharmonic spelling (spec §6) ----------

// Sharp keys spell accidentals with sharps; everything else uses flats.
const SHARP_KEY_PCS = new Set([2, 4, 6, 7, 9, 11]); // D E F# G A B

// One canonical spelling per root: sharps for G D A E B F#, flats for F Bb
// Eb Ab Db, naturals for the rest. Stored as [letter index, alteration].
const ROOT_SPELLING = [
  [0, 0], // C
  [1, -1], // Db
  [1, 0], // D
  [2, -1], // Eb
  [2, 0], // E
  [3, 0], // F
  [3, 1], // F#
  [4, 0], // G
  [5, -1], // Ab
  [5, 0], // A
  [6, -1], // Bb
  [6, 0], // B
];

function alterSymbol(alter) {
  if (alter === 1) return "♯";
  if (alter === -1) return "♭";
  return "";
}

function usesSharps(rootPc) {
  return SHARP_KEY_PCS.has(pitchClass(rootPc));
}

// A simple, keyboard-shaped name: the sharp or flat spelling of the key.
function simpleName(pc, rootPc) {
  return usesSharps(rootPc) ? SHARP_NAMES[pitchClass(pc)] : FLAT_NAMES[pitchClass(pc)];
}

export function rootName(rootPc) {
  const [letter, alter] = ROOT_SPELLING[pitchClass(rootPc)];
  return LETTERS[letter] + alterSymbol(alter);
}

// Spells a chord by scale degree, so C maj7 is C E G B rather than C E G Cb.
// Two spellings are rejected in favour of the plain enharmonic name:
//   - double accidentals (F# aug would want C##), and
//   - E#/B#/Fb/Cb, which name a key the 12-key keyboard labels differently
//     and so read as a puzzle rather than a lesson (this is why the spec's
//     own example spells F# maj7 as F# A# C# F, not F# A# C# E#).
export function spellChord(rootPc, qualityId) {
  const q = quality(qualityId);
  const [rootLetter] = ROOT_SPELLING[pitchClass(rootPc)];

  return q.offsets.map((offset, i) => {
    const targetPc = pitchClass(rootPc + offset);
    const letter = (rootLetter + (q.degrees[i] - 1)) % 7;
    let alter = targetPc - LETTER_PC[letter];
    if (alter > 6) alter -= 12;
    if (alter < -6) alter += 12;

    const name = LETTERS[letter] + alterSymbol(alter);
    const awkward = Math.abs(alter) > 1 || ["E♯", "B♯", "F♭", "C♭"].includes(name);
    return awkward ? simpleName(targetPc, rootPc) : name;
  });
}

// "F# major 7" — the Build the Chord prompt (spec §9.2).
export function chordLabel(rootPc, qualityId) {
  return `${rootName(rootPc)} ${quality(qualityId).name}`;
}

// "F#maj7" — the compact form for review rows.
export function chordSymbol(rootPc, qualityId) {
  return rootName(rootPc) + quality(qualityId).symbol;
}

// ---------- Voicings (spec §4.2) ----------

// Inversions move the lowest notes up an octave. They change what the player
// hears, never the pitch-class set they have to click.
export function voiceChord(rootPc, qualityId, inversion = 0, base = KEYBOARD_BASE_MIDI) {
  const offsets = quality(qualityId).offsets;
  const rootMidi = base + pitchClass(rootPc);
  let midis = offsets.map((o) => rootMidi + o);

  const turns = ((inversion % midis.length) + midis.length) % midis.length;
  for (let i = 0; i < turns; i++) midis.push(midis.shift() + 12);

  // High roots and third inversions would otherwise climb into a piercing
  // register, so the whole voicing is nudged back around the octave the
  // keyboard displays. Transposing by octaves leaves the answer untouched.
  while (Math.max(...midis) > base + 19) midis = midis.map((m) => m - 12);
  while (Math.min(...midis) < base - 12) midis = midis.map((m) => m + 12);

  return midis;
}

// A plain ascending voicing for a set of pitch classes — used to play back
// the player's own guess in feedback (spec §9.3).
export function voicePcs(pcs, base = KEYBOARD_BASE_MIDI) {
  return [...pcs].map(pitchClass).sort((a, b) => a - b).map((pc) => base + pc);
}

// ---------- Answer comparison (spec §7) ----------

export function normalizePcs(pcs) {
  return [...new Set([...pcs].map(pitchClass))].sort((a, b) => a - b);
}

// No partial credit: the sets match exactly or the answer is wrong.
export function pcSetsEqual(a, b) {
  const x = normalizePcs(a);
  const y = normalizePcs(b);
  return x.length === y.length && x.every((pc, i) => pc === y[i]);
}

// ---------- Generated teaching notes (spec §9.3) ----------

const TRIAD_IDS = ["major", "minor", "dim", "aug", "sus2", "sus4"];

// Derived from the formula, never authored: a seventh chord is described as
// its triad plus the seventh, anything else as its stack of intervals.
export function chordTeachingNote(rootPc, qualityId) {
  const q = quality(qualityId);
  const spelled = spellChord(rootPc, qualityId).join(" ");
  const label = chordLabel(rootPc, qualityId);

  if (q.offsets.length === 4) {
    const triadId = TRIAD_IDS.find((id) =>
      CHORD_QUALITIES[id].offsets.every((o, i) => o === q.offsets[i])
    );
    if (triadId) {
      const triadName = CHORD_QUALITIES[triadId].name;
      const seventh = INTERVAL_NAMES[q.offsets[3]];
      return `A ${label} is a ${triadName} triad plus a ${seventh} — ${spelled}.`;
    }
  }

  const stack = q.offsets.slice(1).map((o) => INTERVAL_NAMES[o]);
  return `A ${label} stacks a root, ${stack.join(", ")} — ${spelled}.`;
}

export function noteTeachingNote(tonicPc, targetPc) {
  const tonic = SHARP_NAMES[pitchClass(tonicPc)];
  const target = bothNames(targetPc);
  const steps = intervalSemitones(tonicPc, targetPc);
  if (steps === 0) return `${target} is the reference tonic itself.`;
  return `${target} is a ${INTERVAL_NAMES[steps]} above the tonic ${tonic}.`;
}
