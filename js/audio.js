// Audio engine (spec §5). Everything the game plays goes through the
// AudioEngine interface below; nothing outside this file touches
// AudioContext. Swapping SynthEngine for a sampled-piano SampleEngine later
// means implementing the same methods and changing the export at the bottom.
//
//   resume()                                 unlock/restart the context
//   playNote(midi, { duration, velocity, when, onNote })
//   playChord(midis, { style, duration, when, onNote })   style: block|arpeggio
//   stopAll()
//   isReady()
//
// Extras both engines are expected to honour: setVolume/getVolume, and the
// onNote callback, which fires at each onset so the UI can flash the key that
// is sounding (spec §8 — every audio event needs a visual counterpart).

import { midiToFreq } from "./theory.js";

// Voice (spec §5.2)
const SUB_GAIN = 0.35;
const ATTACK = 0.01;
const DECAY = 0.12;
const SUSTAIN = 0.55;
const RELEASE = 0.35;
const PEAK = 0.32;

// Master chain
const FILTER_HZ = 4000;
const FILTER_Q = 0.7;
const DEFAULT_VOLUME = 0.7;

// Playback defaults
export const NOTE_DURATION = 1.2;
export const CHORD_DURATION = 1.8;
export const ARPEGGIO_GAP = 0.13;
const MAX_VOICES = 8;

function createSynthEngine() {
  let ctx = null;
  let filter = null;
  let master = null;
  let volume = DEFAULT_VOLUME;
  let voices = [];

  // The context is created on the first user gesture, never at page load —
  // browsers block autoplay otherwise (spec §5.3).
  function ensureContext() {
    if (ctx) return ctx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;

    ctx = new Ctor();
    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = FILTER_HZ;
    filter.Q.value = FILTER_Q;

    master = ctx.createGain();
    master.gain.value = volume;

    filter.connect(master);
    master.connect(ctx.destination);
    return ctx;
  }

  function releaseVoice(voice, at) {
    if (voice.releasing) return;
    voice.releasing = true;
    const t = Math.max(at, ctx.currentTime);
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0001), t);
    voice.gain.gain.linearRampToValueAtTime(0.0001, t + 0.03);
    voice.oscillators.forEach((osc) => {
      try {
        osc.stop(t + 0.04);
      } catch {
        /* already stopped */
      }
    });
  }

  // Leaked OscillatorNodes are the classic Web Audio bug: every voice is
  // disconnected on end and dropped from the pool (spec §5.3).
  function disposeVoice(voice) {
    voices = voices.filter((v) => v !== voice);
    voice.oscillators.forEach((osc) => osc.disconnect());
    voice.nodes.forEach((node) => node.disconnect());
  }

  function enforceVoiceCap() {
    while (voices.length >= MAX_VOICES) {
      const oldest = voices.find((v) => !v.releasing) || voices[0];
      if (!oldest) return;
      releaseVoice(oldest, ctx.currentTime);
      // Dropped from the pool now rather than on `onended`, which fires too
      // late to keep this loop from spinning.
      voices = voices.filter((v) => v !== oldest);
    }
  }

  function scheduleVisual(onNote, midi, startTime) {
    if (typeof onNote !== "function") return;
    const delayMs = Math.max(0, (startTime - ctx.currentTime) * 1000);
    if (delayMs < 12) {
      onNote(midi);
    } else {
      setTimeout(() => onNote(midi), delayMs);
    }
  }

  function startVoice(midi, startTime, duration, velocity) {
    const freq = midiToFreq(midi);
    const gain = ctx.createGain();
    gain.connect(filter);

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, startTime);
    osc.connect(gain);

    // A sine an octave down under the triangle: warmer than a bare square,
    // still unmistakably chiptune (spec §5.2).
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(freq / 2, startTime);
    const subGain = ctx.createGain();
    subGain.gain.value = SUB_GAIN;
    sub.connect(subGain);
    subGain.connect(gain);

    // ADSR, always ramped — abrupt gain changes click.
    const peak = PEAK * velocity;
    const sustainLevel = peak * SUSTAIN;
    const releaseAt = startTime + Math.max(duration, ATTACK + DECAY);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peak, startTime + ATTACK);
    gain.gain.linearRampToValueAtTime(sustainLevel, startTime + ATTACK + DECAY);
    gain.gain.setValueAtTime(sustainLevel, releaseAt);
    gain.gain.linearRampToValueAtTime(0.0001, releaseAt + RELEASE);

    const stopAt = releaseAt + RELEASE + 0.02;
    osc.start(startTime);
    sub.start(startTime);
    osc.stop(stopAt);
    sub.stop(stopAt);

    const voice = {
      gain,
      oscillators: [osc, sub],
      nodes: [gain, subGain],
      startTime,
      releasing: false,
    };
    osc.onended = () => disposeVoice(voice);
    voices.push(voice);
    return voice;
  }

  return {
    // Call on a user gesture (the Start button) and again whenever the
    // context has been suspended by a backgrounded tab or iOS (spec §5.3).
    async resume() {
      const context = ensureContext();
      if (!context) return false;
      if (context.state === "suspended") {
        try {
          await context.resume();
        } catch {
          return false;
        }
      }
      return context.state === "running";
    },

    isReady() {
      return Boolean(ctx) && ctx.state === "running";
    },

    getState() {
      return ctx ? ctx.state : "uninitialized";
    },

    setVolume(value) {
      volume = Math.min(1, Math.max(0, Number(value)));
      if (master) {
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setTargetAtTime(volume, now, 0.02);
      }
    },

    getVolume() {
      return volume;
    },

    playNote(midi, options = {}) {
      const context = ensureContext();
      if (!context) return 0;
      if (context.state === "suspended") context.resume().catch(() => {});

      const { duration = NOTE_DURATION, velocity = 1, when = 0, onNote } = options;
      const startTime = context.currentTime + Math.max(0, when);

      enforceVoiceCap();
      startVoice(midi, startTime, duration, velocity);
      scheduleVisual(onNote, midi, startTime);
      return duration + RELEASE;
    },

    // Returns the seconds this gesture occupies, so callers can schedule what
    // comes next (guess-then-answer feedback) without duplicating the timing.
    playChord(midis, options = {}) {
      const context = ensureContext();
      if (!context || !midis.length) return 0;
      if (context.state === "suspended") context.resume().catch(() => {});

      const {
        style = "block",
        duration = CHORD_DURATION,
        when = 0,
        onNote,
        velocity,
      } = options;

      const gap = style === "arpeggio" ? ARPEGGIO_GAP : 0;
      const ordered = [...midis].sort((a, b) => a - b);
      // Keep the sum of simultaneous voices inside the master's headroom.
      const level = velocity ?? 1 / Math.sqrt(ordered.length);
      const base = context.currentTime + Math.max(0, when);

      ordered.forEach((midi, i) => {
        // Checked per note, not once per chord: a four-note chord must not be
        // able to push the pool past the cap in one gesture.
        enforceVoiceCap();
        const startTime = base + i * gap;
        startVoice(midi, startTime, Math.max(0.4, duration - i * gap), level);
        scheduleVisual(onNote, midi, startTime);
      });

      return duration + (ordered.length - 1) * gap + RELEASE;
    },

    stopAll() {
      if (!ctx) return;
      const now = ctx.currentTime;
      voices.slice().forEach((voice) => releaseVoice(voice, now));
    },
  };
}

export const AudioEngine = createSynthEngine();
