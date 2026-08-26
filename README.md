# Chordji

A browser ear-training and chord-theory game. A note plays and you identify it
on a piano keyboard; or a chord is given — by sound or by name — and you pick
the notes that build it.

Part of the [Fantastic App Suite](https://brenopaiva.com/) alongside
[Funky Dancer](https://brenopaiva.com/FunkyDancer/),
[Codji](https://brenopaiva.com/Codji/) and
[Wordji](https://brenopaiva.com/Wordji/).

**Play it:** https://brenopaiva.com/Chordji/

## Modes

| Mode | Prompt | You do | Skill |
|---|---|---|---|
| **Name That Note** | A reference tonic plays, then a target note | Click the one key you heard | Relative-pitch ear |
| **Hear the Chord** | A reference tonic plays, then a chord | Click every note in the chord | Chord ear |
| **Build the Chord** | A chord name, e.g. `F♯ major 7` | Click the notes that build it | Chord theory |

Every ear question plays a reference tonic first, so notes are identified by
*interval* rather than absolute pitch — this is not an absolute-pitch drill.
Build the Chord plays no audio until feedback, where the theory and the sound
get wired together.

## Difficulty

**Name That Note**

| | Note pool | Reference tonic |
|---|---|---|
| Easy | The 7 naturals of C major | Always C |
| Medium | All 12 chromatic notes | Always C |
| Hard | All 12 chromatic notes | Randomised every question |

**Both chord modes**

| | Chord qualities | Roots | Voicing |
|---|---|---|---|
| Easy | major, minor | Naturals only | Root position |
| Medium | + dim, aug, sus2, sus4 | All 12 | Root position |
| Hard | + maj7, m7, dom7, m7♭5, dim7 | All 12 | Root position and inversions |

Answers are always **pitch classes** — the keyboard is one octave wide in every
mode, and octave never enters into a comparison. Inversions change what you
hear, not what you have to click. Chord answers get **no partial credit**: a
3-of-4 answer scores zero.

Sessions run for 5, 10 or 20 questions, or for 1, 3 or 5 minutes. Questions are
generated from theory rules rather than an authored bank, so a session never
runs out of material; a question is rejected if it matches any of the previous
three.

## Controls

The DAW-standard row, so accidentals sit directly above their white keys:

```
  W E   T Y U        C♯ D♯   F♯ G♯ A♯
 A S D F G H J   =   C  D  E  F  G  A  B
```

`Space` replays the question, `R` plays the reference tonic, `Enter` checks
your answer and advances. Every key is also clickable and playable — pressing
one sounds it, so you can check a guess against the reference. Replays are
unlimited and free; they are counted in the review but never affect scoring.

## Sound

v1 synthesises everything with the Web Audio API — no audio assets and no load
step. The voice is a triangle oscillator with a sine an octave below it at 35%,
through a soft ADSR envelope and a 4 kHz lowpass.

All playback goes through the `AudioEngine` interface in
[`js/audio.js`](js/audio.js):

```js
AudioEngine.resume();
AudioEngine.playNote(midi, { duration, velocity, when, onNote });
AudioEngine.playChord(midis, { style, duration, when, onNote }); // 'block' | 'arpeggio'
AudioEngine.stopAll();
AudioEngine.isReady();
```

A sampled-piano `SampleEngine` implementing the same methods drops in at one
export site without game logic changing. The `AudioContext` is created lazily
on the first user gesture (the Start button) — browsers block autoplay
otherwise — and if it is ever suspended, a "tap to enable sound" affordance
appears rather than the game silently failing.

## Feedback

Feedback is inline and always audible: a correct answer plays back once, and a
wrong answer plays **your guess first, then the right answer**, so the
difference is heard rather than read. Wrong picks go red, notes you missed get
a distinct striped style, and a teaching note generated from the chord formula
explains what the chord actually is. Advance is manual — never auto-timed.

## Structure

No framework, no build step, no backend. Plain static files and vanilla ES
modules; hosting is just serving the repo.

```
index.html
css/styles.css
js/
  main.js       bootstrap, screen routing, keyboard shortcuts
  game.js       session state machine, validation, scoring
  generator.js  procedural question generation
  theory.js     note/chord math, formulas, enharmonic spelling
  audio.js      AudioEngine interface + SynthEngine
  keyboard.js   the piano keyboard component
  ui.js         DOM rendering helpers
  storage.js    localStorage
images/         favicons, OG image, screenshot
```

[`js/theory.js`](js/theory.js) is pure functions over integers with no DOM and
no audio — it is the one part of the codebase with right and wrong answers
independent of the UI, which keeps it trivially testable.

## Persistence

`localStorage` only — no accounts, no analytics, no shared leaderboard.
`chordji.history` keeps the last 20 sessions, `chordji.best` the best accuracy
per mode/difficulty/length combination, and `chordji.settings` your volume,
playback style and last-used setup. Every access is wrapped in `try`/`catch`:
private-mode browsers throw on `localStorage`, and the game runs fine without
it.

## Notes on two spec readings

- **Inversions apply to Hear the Chord only.** Their stated purpose is to make
  the ear work harder. Build the Chord never asks for an inversion, so playing
  its feedback in one would just look like the game disagreeing with the
  answer you correctly built.
- **Chord spelling falls back on awkward names.** Chords are spelled by scale
  degree, so C maj7 is `C E G B`. Double accidentals and `E♯`/`B♯`/`F♭`/`C♭`
  are replaced by the plain enharmonic name, because they label a key that the
  12-key keyboard shows differently — `F♯ maj7` reads `F♯ A♯ C♯ F`, as in the
  spec's own example.

## Development

Any static server works; ES modules need HTTP rather than `file://`:

```sh
python3 -m http.server 8765
```

Then open http://localhost:8765/. All asset paths are relative, so the game
works both at the domain root and under the `/Chordji/` subpath it ships on.
