# Chordji — Game Specification

A browser ear-training and chord-theory game. A note plays and the player
identifies it on a piano keyboard; or a chord is given — by sound or by name
— and the player picks the notes that build it.

Part of the Fantastic App Suite (Funky Dancer, Codji, Wordji), hosted on
GitHub Pages and skinned to match brenopaiva.com.

This document is the source of truth for building v1. Every substantive
open question has been answered by the user (§1) and the build sequence is
in §14 — **this spec is ready to build against**. The `**(assumption)**`
flags that remain mark small calls made in passing, all catalogued in §15;
none of them block starting.

---

## 1. Decisions locked in by the user

- **Audio — synth now, samples later.** v1 generates tones with the Web
  Audio API (no audio assets, no load step). All playback goes through an
  `AudioEngine` interface so a sampled-piano implementation can be dropped
  in later without touching game logic. See §5.
- **Answer input — on-screen piano keyboard.** The player clicks keys on a
  rendered keyboard. One component serves every mode: identifying a heard
  note, and selecting the set of notes in a chord. See §8.
- **Pitch context — reference note first.** Every ear question plays a
  reference tonic before the target, so notes are identified by *interval*,
  not absolute pitch. Absolute-pitch drilling is explicitly not the game.
- **Chord mode — both flavors, as two separate modes.** *Build the Chord*
  shows a chord name as text and the player constructs it (theory). *Hear
  the Chord* plays a chord and the player picks the notes they hear (ear).
  Same keyboard input for both.

### Confirmed in follow-up

- **Octaves never matter.** Answers are pitch classes; the keyboard is one
  octave in every mode and difficulty. Hard's challenge is the moving
  tonic, not octave discrimination.
- **No partial credit** on chord answers — a chord is right or it isn't.
- **No Mixed mode in v1.** One game mode per session.
- **Single theme, no dark mode** — Chordji looks like brenopaiva.com.
- **Synth voice: triangle + sub-octave sine**, soft envelope (§5.2).
- **Wrong-answer red: `#E08585` / `#A34B4B`**, a new palette token (§10).
- **Physical keys: DAW-standard row** `A W S E D F T G Y H U J` (§8).
- **Build order: Name That Note first, end to end** (§14).

---

## 2. Core loop

1. **Setup screen** — choose Mode, Difficulty, and Session length (§3).
2. **Question screen** — listen and/or read the prompt, select note(s) on
   the keyboard, submit.
3. **Feedback** — instant correct/incorrect, the correct answer shown *and
   played*, then manual advance.
4. **Results screen** — accuracy %, correct/total, per-question review,
   replay or return to setup.

Single-page app, three screens, no routing beyond that.

**Ear training needs hearing the answer, not just reading it.** Feedback
always plays the correct note/chord back, and on a wrong answer plays the
player's guess first, then the right answer, so the difference is audible.
This is the single most important learning mechanic in the game — it is not
optional polish.

---

## 3. Session modes

### 3.1 The three game modes

| Mode | Prompt | Player does | Skill |
|---|---|---|---|
| **Name That Note** | Reference tonic plays, then a target note | Clicks the one key they heard | Relative-pitch ear |
| **Hear the Chord** | Reference tonic plays, then a chord | Clicks every note in the chord | Chord ear |
| **Build the Chord** | Chord name as text, e.g. `D minor 7` | Clicks every note in the chord | Chord theory |

*Build the Chord* plays **no audio before the answer** — it is a knowledge
drill. It still plays the chord in feedback, which is where the theory and
the sound get wired together.

Modes are chosen one at a time; there is **no mixed session** that shuffles
all three. A "Mixed" option is a natural v2 addition once each mode's
question screen is proven.

### 3.2 Difficulty

Difficulty is topic-based (matching Codji's approach), not just "faster" —
see §4 for the exact pools.

### 3.3 Session length

- **Count:** 5, 10, or 20 questions. Ends after that many are answered.
- **Timed:** 1, 3, or 5 minutes. Ends when the clock hits 0.

Question selection is **procedurally generated**, not drawn from an authored
bank (see §6) — so sessions never run out of material and repeats are
avoided by a simple "don't repeat the last N questions" rule (N = 3).
**(assumption)**

### 3.4 Ending a session mid-way

- **Timed mode, clock expires with a question in progress:** that question
  is marked *unanswered*, excluded from accuracy, listed separately in the
  review. Accuracy = correct / (correct + incorrect).
- **Quit button** on the question screen at all times, with a confirm step.
  Quitting discards the session (not saved to history) and returns to setup.
  **(assumption — mirrors Codji)**

---

## 4. Difficulty → content pools

### 4.1 Name That Note

| Difficulty | Note pool | Reference tonic | Keyboard shown |
|---|---|---|---|
| Easy | 7 naturals of C major (C D E F G A B) | Always C, playable on demand | 1 octave, C4–B4 |
| Medium | All 12 chromatic notes | Always C, playable on demand | 1 octave, C4–B4 |
| Hard | All 12 chromatic notes | **Randomized per question**, announced by sound only | 1 octave, root-relative |

Hard's difficulty is the moving tonic: the player must hold a shifting
reference in their head rather than anchoring to C every time.

Answers are **pitch classes** throughout — the target note is always sounded
in the octave the keyboard displays, so octave discrimination is never part
of the answer. The keyboard is one octave wide in every mode and difficulty,
and pitch-class equality is the only comparison the game ever needs (§7).

### 4.2 Hear the Chord / Build the Chord

| Difficulty | Chord qualities | Roots | Voicing |
|---|---|---|---|
| Easy | major, minor | Naturals only (C D E F G A B) | Root position |
| Medium | + diminished, augmented, sus2, sus4 | All 12 chromatic | Root position |
| Hard | + maj7, min7, dom7, min7♭5, dim7 | All 12 chromatic | Root position **and inversions** |

Chord formulas as semitone offsets from the root:

| Quality | Symbol | Offsets |
|---|---|---|
| major | `C` | 0, 4, 7 |
| minor | `Cm` | 0, 3, 7 |
| diminished | `Cdim` | 0, 3, 6 |
| augmented | `Caug` | 0, 4, 8 |
| sus2 | `Csus2` | 0, 2, 7 |
| sus4 | `Csus4` | 0, 5, 7 |
| major 7th | `Cmaj7` | 0, 4, 7, 11 |
| minor 7th | `Cm7` | 0, 3, 7, 10 |
| dominant 7th | `C7` | 0, 4, 7, 10 |
| half-diminished | `Cm7♭5` | 0, 3, 6, 10 |
| diminished 7th | `Cdim7` | 0, 3, 6, 9 |

**Inversions (Hard) change playback voicing only, not the answer.** A C
major triad in first inversion sounds E–G–C but is still the pitch-class set
{C, E, G}. This makes the ear work harder without making the input
ambiguous. Prompts in Build the Chord never ask for an inversion in v1.

---

## 5. Audio engine

### 5.1 Interface (the swap point for samples later)

```js
// js/audio.js
export const AudioEngine = {
  resume(),                              // call on first user gesture
  playNote(midi, { duration, velocity, when }),
  playChord(midiArray, { style, duration }),  // style: 'block' | 'arpeggio'
  stopAll(),
  isReady()
};
```

v1 ships `SynthEngine` behind this interface. A future `SampleEngine`
implements the same five methods and swaps in at one import site. Game
logic, scoring, and UI never touch `AudioContext` directly.

### 5.2 Synth voice

- **Pitch:** `freq = 440 * 2 ** ((midi - 69) / 12)`.
- **Oscillators:** a `triangle` at pitch plus a `sine` one octave below at
  ~35% gain. Warmer and less piercing than a bare square/saw, still
  unmistakably chiptune — which suits the site's retro aesthetic.
- **Envelope (ADSR) on a per-voice GainNode:** attack 0.01s, decay 0.12s,
  sustain 0.55, release 0.35s. Ramp with `setTargetAtTime` /
  `linearRampToValueAtTime`, never abrupt gain changes (they click).
- **Master chain:** per-voice gain → lowpass (~4kHz, Q 0.7) → master gain
  (default 0.7) → destination.
- **Note length:** 1.2s default for single notes, 1.8s for chords.
- **Arpeggio style:** 130ms between onsets, ascending.

### 5.3 Browser audio rules that must be handled

- `AudioContext` is created **lazily on the first user gesture** (the Start
  button), never at page load — browsers block autoplay otherwise.
- If the context is `suspended` when a question starts (tab was
  backgrounded, iOS quirk), call `resume()` and show a "Tap to enable
  sound" affordance rather than silently failing.
- Cap simultaneous voices at 8 and always disconnect finished nodes —
  leaked `OscillatorNode`s are the classic Web Audio memory bug.
- Every voice gets an explicit `stop()` scheduled; `stopAll()` on screen
  change and on quit.

### 5.4 Replay

A prominent **Replay** button on every ear question, unlimited and free —
plus a separate **Play reference** button (Easy/Medium: plays C; Hard:
plays that question's tonic). Replays are counted per question and shown in
the review as information only; they never affect scoring. Ear training
where you can only listen once is a memory test, not an ear test.

---

## 6. Question generation

Unlike Codji, Chordji has **no authored question bank** — questions are
generated from theory rules, so the content is effectively infinite and
`/data/*.json` files are unnecessary.

```js
// Name That Note
{ type: 'note', tonicMidi: 60, targetMidi: 64, answer: ['E'] }

// Hear the Chord
{ type: 'chordEar', tonicMidi: 60, rootPc: 2, quality: 'm7',
  voicing: [62, 65, 69, 72], answer: ['D', 'F', 'A', 'C'] }

// Build the Chord
{ type: 'chordBuild', rootPc: 6, quality: 'maj7',
  label: 'F# major 7', answer: ['F#', 'A#', 'C#', 'F'] }
```

The generator picks uniformly at random from the difficulty's pools (§4),
rejecting any question identical to the previous 3.

### Enharmonic spelling

Internally every note is a **pitch class 0–11**; `C#` and `Db` are the same
answer and the keyboard cannot distinguish them. For *display*, use the
theoretically correct spelling for the chord's root: `Eb G Bb` for Ebm, not
`D# G A#`. A small spelling table keyed by root pitch class + quality
handles this — sharps for sharp keys (G, D, A, E, B, F#), flats for flat
keys (F, Bb, Eb, Ab, Db). Keyboard key labels themselves show **sharps
only** (`C♯`), with the flat name carried in the `aria-label` ("C sharp,
also D flat") — a black key labelled `C♯/D♭` at mobile widths is unreadable.
**(assumption)**

---

## 7. Answer validation & scoring

**Name That Note:** exactly one key selected; correct if its pitch class
equals the target's.

**Both chord modes:** the player toggles keys on/off and submits a *set* of
pitch classes. Correct if the set is exactly equal to the chord's pitch-class
set — order irrelevant, duplicates impossible, and **no partial credit**
(a 3-of-4 answer is wrong). Submit is disabled until at least the expected
number of notes is selected, and the UI shows `3 of 4 notes selected` so
nobody submits by accident. **No partial credit:** a 3-of-4 answer scores
zero, which keeps accuracy % meaning "chords I actually got right".
Feedback still shows precisely which note was missed (§9.3).

**Scoring is accuracy-focused, matching Codji:**

- Correct / total and accuracy %.
- No points, no speed bonus, no hint or replay penalties.
- Timed mode caps session length only; it does not affect scoring.
- **Best streak** is tracked and displayed as a stat on the results screen,
  but it is not a score. **(assumption)**

---

## 8. The piano keyboard component

The centerpiece of the UI, shared by all three modes.

- **Range:** one octave, C through B — 7 white keys, 5 black keys.
- **Markup:** buttons, not divs — real `<button>` elements give keyboard
  focus, Enter/Space activation, and screen-reader semantics for free.
  White keys in a flex row; black keys absolutely positioned over the
  boundaries at the standard offsets.
- **States:** default, hover, focus-visible, **selected** (chord modes:
  toggles, stays lit), **correct** (green), **wrong** (red), **missed**
  (the note you should have picked — shown in feedback, distinct styling).
- **Selection rules:** single-select in Name That Note (clicking a new key
  moves the selection); multi-select toggle in both chord modes.
- **Audible on press:** clicking a key plays that note immediately — the
  keyboard is playable, which matters for checking a guess against the
  reference.
- **Physical keyboard shortcuts:** the standard DAW row —
  `A W S E D F T G Y H U J` = C C# D D# E F F# G G# A A# B, so accidentals
  sit on the upper row directly above their white keys and the hand shape
  matches a real keyboard. Plus `Space` = replay, `R` = reference, `Enter`
  = submit/next. This layout is not self-evident, so the question screen
  shows a small dismissible legend on first run, and each key carries its
  shortcut letter as a subtle corner label (toggleable in settings).
- **Accessibility:** this is an audio game, so every audio event has a
  visual counterpart (the played key flashes during playback in feedback).
  Correct/wrong states use icons and text, never color alone. Each key has
  an `aria-label` ("C sharp, also D flat") and `aria-pressed`.
- **Mobile:** keys must stay tappable at 360px wide — white keys ~44px
  minimum touch target, black keys narrower but tall enough. The keyboard
  scales with the viewport rather than scrolling horizontally.

---

## 9. Screens

### 9.1 Setup screen

- Site-matching header (§10), with a "← brenopaiva.com" link back.
- **Mode** selector: Name That Note / Hear the Chord / Build the Chord —
  each with a one-line description of what it drills.
- **Difficulty:** Easy / Medium / Hard, with the pool summarized ("naturals
  only", "all 12 notes", "chromatic + moving tonic").
- **Length:** Count (5/10/20) or Timed (1/3/5 min).
- **Volume** slider + a "test sound" button — worth having *before* the
  session starts, so nobody discovers their volume is muted on question 1.
- Last result + best accuracy for the current mode+difficulty+length combo,
  from localStorage (§11).
- **Start** button (this is also the gesture that unlocks `AudioContext`).

### 9.2 Question screen

- Header: `Question X of Y`, or a countdown timer with a thin progress bar.
- Prompt area, per mode:
  - *Name That Note* — "What note is this?" + **Replay** and **Reference**
    buttons.
  - *Hear the Chord* — "Which notes are in this chord?" + **Replay**,
    **Reference**, and a **Block / Arpeggio** toggle for playback style.
  - *Build the Chord* — the chord name rendered large in VT323, e.g.
    `F♯ major 7`, no audio controls until feedback.
- The keyboard (§8).
- Selection counter (`2 of 3 notes selected`) in chord modes.
- **Check** button, or Enter.
- **Quit** (with confirm) in the corner.

### 9.3 Feedback — inline on the question screen, not a separate screen

- Correct: green highlight on the right keys, checkmark, brief affirmation,
  and the note/chord plays once more.
- Incorrect: the player's wrong picks go red, the missed notes light up in
  the "missed" style, and audio plays **the guess, then the answer**, so the
  error is heard.
- A one-line teaching note where it helps: *"A minor 7 is a minor triad plus
  a flat 7 — D F A C."* Generated from the chord formula, not authored.
- **Next** via Enter or button — manual advance, never auto-timed. The timed
  clock keeps running in the background regardless.

### 9.4 Results screen

- Correct X / Total Y, Accuracy %, best streak.
- Unanswered count, if any.
- Per-question review: prompt, what the player picked, what was correct, and
  a small **play** button per row to hear it again.
- **(assumption)** A "most-missed" line — e.g. *"You missed diminished
  chords most often (1/4)."* Cheap to compute, and it's the thing that
  actually directs practice.
- Buttons: **Play Again** (same settings) / **New Session** (back to setup).
- Session saved to localStorage history here — not on quit.

### 9.5 Free Play — the keyboard with the game switched off

Reached from a secondary button under **Start** on the setup screen, and left
by **Back** or `Esc`. No questions, no scoring, nothing written to history.

- The same one-octave keyboard component, in a third select mode: a press
  sounds the note and nothing latches, because there is no answer to submit.
- **Octave control** — `◀`/`▶` buttons and `Z`/`X`, showing the current range
  as *Octave 4 · C4–B4*. Range **C2–B6**: outside it the synth voice stops
  sounding like an instrument (the sub-oscillator drops under 30 Hz below C2,
  the triangle is pure whistle above B6). The choice persists.
- A readout under the keyboard names the note last played, with both
  spellings and the octave — `C♯4 / D♭4`.
- **Note length** short/long, because the game's staccato 0.7 s note is not
  something you would want to play a tune with.
- Its own volume slider: Free Play is reachable without a second trip through
  the setup screen.
- Octave lives in Free Play only. The game still sounds and answers in one
  fixed octave from C4 (§4.1) — pitch classes stay the unit of an answer.

---

## 10. Visual design — brenopaiva.com aesthetic

Chordji matches the portfolio site, not Codji's Claude-styled look. Retro,
chunky, pixel-terminal.

- **Fonts:** `VT323` for headings/display, `Share Tech Mono` for body and
  UI, both from Google Fonts, loaded exactly as the site loads them.
- **Palette:** copy the site's `:root` tokens verbatim into
  `css/styles.css` — Chordji is a separate repo and must not depend on the
  portfolio's `main.css`.

  ```css
  --primary-0:#809EC0; --primary-1:#CADFF7; --primary-2:#A3C1E1;
  --primary-3:#647F9D; --primary-4:#39516B;
  --secondary-1-0:#ABE692; --secondary-1-1:#D9FCCA; --secondary-1-2:#C0F3AB;
  --secondary-1-3:#96CF7E; --secondary-1-4:#5B8C46;
  --secondary-2-0:#A183C5; --secondary-2-1:#DFCBF8; --secondary-2-2:#C1A5E3;
  --secondary-2-3:#8368A3; --secondary-2-4:#533B6F;
  ```

- **Roles:** page background `--primary-2`; header/nav bar `--primary-4`;
  panels in the `.tv` card style (`--secondary-2-2` fill,
  `--secondary-2-3` border, `border-radius: 50% / 10%`); primary buttons in
  the `.project-links h3` style (`--secondary-1-1` fill, 2px
  `--secondary-1-0` border, 20px radius, `--secondary-1-2` on hover);
  alternating sections `--primary-1`.
- **Title treatment:** the site's `.text-header` — `--secondary-1-0` green,
  wide letter-spacing, four-way black text-shadow outline. `CHORDJI` sits
  in a `.space-header`-style band.
- **Correct/incorrect colors:** green from the `--secondary-1-*` ramp, and
  a red **added** to the palette as a new token pair (the site has none) —
  `--wrong-0: #E08585` fill, `--wrong-1: #A34B4B` border. Tuned to the
  saturation and softness of the existing ramps so it reads as a missing
  member of the same family rather than a bootstrap red. Always paired with
  an icon and text, never color alone.
- **Piano keys:** white keys off-white with 2–3px black outlines (matching
  the site's outlined-text motif); black keys `--primary-4`. Selected =
  `--secondary-2-1`, correct = green ramp, wrong = the red above.
- **Motion:** subtle — a key press depresses a couple of pixels, a soft
  pulse on correct, a short shake on incorrect, and a visible pulse on each
  key as it sounds during playback. Respect
  `prefers-reduced-motion: reduce`.
- **Single theme, no dark mode** — the portfolio has none, and Chordji
  should look like it belongs. (This is a deliberate divergence from
  Codji.)
- **Responsiveness:** works from 360px up. No horizontal scroll; the
  keyboard scales rather than overflowing.

---

## 11. Persistence

No backend — `localStorage` only:

- `chordji.history` — last 20 sessions:
  `{ timestamp, mode, difficulty, lengthType, lengthValue, correct, total, unanswered, accuracy, bestStreak }`
- `chordji.best` — map keyed by `mode:difficulty:lengthType:lengthValue` →
  best accuracy.
- `chordji.settings` — volume, arpeggio/block preference, last-used setup
  choices.

No accounts, no analytics, no shared leaderboard. All reads/writes wrapped
in try/catch — private-mode browsers throw on `localStorage` access, and
the game must run fine with persistence unavailable.

---

## 12. Tech stack & structure **(assumption)**

Plain static site, vanilla ES modules, no framework and no build step — so
GitHub Pages hosting is just "serve the repo".

```
/index.html
/css/styles.css
/js/
  main.js       # bootstrap, screen routing, keyboard shortcuts
  game.js       # session state machine (setup → question → results)
  generator.js  # procedural question generation (§6)
  theory.js     # note/chord math, formulas, enharmonic spelling
  audio.js      # AudioEngine interface + SynthEngine (§5)
  keyboard.js   # piano keyboard component (§8)
  ui.js         # DOM rendering helpers
  storage.js    # localStorage (§11)
/images/        # favicon set, OG image, screenshot
/README.md
```

`theory.js` should be pure functions over integers with **no DOM and no
audio** — it's the one part of this codebase with right and wrong answers
independent of the UI, and keeping it pure makes it trivially testable.

### Deployment

- Repo: `Breno-Paiva/Chordji`, GitHub Pages from `main` branch root.
- Serves at `https://brenopaiva.com/Chordji/` — like Codji and Wordji, via
  the user-site custom domain.
- **All asset paths must be relative** (`./css/styles.css`), never
  root-absolute — the game lives under a subpath, not at the domain root.
- Include favicon links and OG/Twitter meta matching the portfolio's
  pattern.

### Portfolio integration (in the `Breno-Paiva.github.io` repo, once live)

1. Add a `.tv` project card to `index.html` — same shape as the Codji and
   Wordji cards, with GIT and LIVE links.
2. Add `images/chordji_pic.png`, a 16:10 screenshot (the existing cards use
   `aspect-ratio: 16 / 10`).
3. Add `"Chordji"` to the `PROJECTS` array in `404.html` so mistyped and
   miscased URLs redirect instead of 404ing.

---

## 13. Out of scope for v1

- Accounts, auth, global or shared leaderboards.
- Microphone input (singing or playing the answer).
- Sheet-music notation / staff rendering.
- Melody or interval-sequence dictation (more than one target note).
- Naming a chord's *quality* by ear as its own question type — the ear
  chord mode asks for notes, per the brief.
- Chord progressions, keys/scales, modes, or inversion identification.
- Real instrument samples (deferred by design — §5.1 keeps the door open).
- MIDI device input.
- Sound in the results-screen review beyond simple per-row replay.

---

## 14. Build sequence

**Name That Note ships first, end to end** — audio engine, keyboard, session
state machine, results, and full styling — before either chord mode starts.
It is the simplest mode but exercises every hard part of the codebase, so
the risky work (Web Audio timing, the keyboard component) gets proven on the
smallest surface. Once it's playable, the chord modes are mostly generator
and validation work on parts that already exist.

### Milestone 1 — playable Name That Note

1. `theory.js` — pitch classes, MIDI ↔ frequency, note names, enharmonic
   spelling. Pure functions, no DOM, no audio.
2. `audio.js` — `AudioEngine` interface + `SynthEngine`: lazy
   `AudioContext`, the §5.2 voice, envelopes, voice cap, `stopAll()`.
3. `keyboard.js` — one-octave keyboard, all six states, click-to-sound,
   DAW-row shortcuts, ARIA.
4. `generator.js` — note questions only, all three difficulties.
5. `game.js` + `ui.js` + `main.js` — setup → question → feedback → results,
   both Count and Timed lengths.
6. `storage.js` — history, bests, settings, every access try/catch wrapped.
7. `css/styles.css` — full site-matching skin (§10), responsive to 360px.

**Done when** a 10-question Easy session plays start to finish on desktop
and phone, audio works after the Start gesture, and results survive a
reload.

### Milestone 2 — the chord modes

8. Chord formulas and inversion voicings in `theory.js`.
9. Chord question generation for both modes in `generator.js`.
10. Multi-select on the keyboard, set-equality validation, selection
    counter.
11. Chord prompt layouts — the block/arpeggio toggle for Hear the Chord,
    the large VT323 chord name for Build the Chord.
12. Generated teaching notes in feedback (§9.3).

**Done when** all three modes are playable at all three difficulties, and
feedback plays guess-then-answer correctly for wrong chord answers.

### Milestone 3 — ship

13. Favicons, OG/Twitter meta, README.
14. GitHub Pages from `main` root — verify every path is relative and the
    game works at the `/Chordji/` subpath, not just at root.
15. Portfolio integration: `.tv` card, 16:10 screenshot, and `"Chordji"`
    added to the `PROJECTS` array in `404.html`.

---

## 15. Remaining minor assumptions

None of these block the build — small calls made in passing, listed so
they're easy to overrule.

- **Session lengths:** Count 5/10/20, Timed 1/3/5 min. (Codji uses 1/3/5
  *questions*, too short for a drilling game.)
- **Quit mid-session discards** the session — not saved to history. Mirrors
  Codji.
- **Best streak** appears on the results screen as a stat, not folded into
  the score.
- **Repeat avoidance:** a generated question is rejected if it matches any
  of the previous 3.
- **Key labels** show sharps (`C♯`) with the flat name in the `aria-label`;
  chord feedback uses the theoretically correct spelling for that key.
- **"Most-missed" line** on the results screen, computed from the session's
  wrong answers.
- **Inversions (Hard) change playback voicing only**, never the expected
  answer set.
