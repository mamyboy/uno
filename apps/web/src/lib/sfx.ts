'use client';

import { playPopClip } from './sounds';

/**
 * Lightweight Web Audio synth for card sound effects — no external audio files needed
 * (fully offline, zero network/CDN dependency). Each action/wild card kind gets its own
 * short, distinct synthesized cue so players can tell cards apart by ear.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state !== 'running') void ctx.resume().catch(() => {});
  return ctx;
}

/** Called from the first user gesture (see sounds.ts) so this context is created "unlocked";
 *  iOS also suspends/interrupts it after app switches → resume on every later tap too. */
export function primeSfx() {
  getCtx();
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', () => { if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => {}); }, true);
  }
}

type Wave = OscillatorType;

/** One pitched tone with a short attack/decay envelope, starting `delay` seconds from now. */
function tone(
  c: AudioContext,
  { freq, endFreq, wave = 'sine', delay = 0, duration = 0.18, gain = 0.22 }: { freq: number; endFreq?: number; wave?: Wave; delay?: number; duration?: number; gain?: number }
) {
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = wave;
  const t0 = c.currentTime + delay;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t0 + duration);
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(amp);
  amp.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** A soft low "thud" layer for extra weight on the bigger cards (Wild Draw Four). */
function thud(c: AudioContext, { delay = 0, duration = 0.3, gain = 0.3 }: { delay?: number; duration?: number; gain?: number }) {
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = 'sine';
  const t0 = c.currentTime + delay;
  osc.frequency.setValueAtTime(160, t0);
  osc.frequency.exponentialRampToValueAtTime(40, t0 + duration);
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(amp);
  amp.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

const PLAYERS: Record<string, (c: AudioContext) => void> = {
  SKIP: (c) => {
    // Sharp descending double-zap.
    tone(c, { freq: 620, endFreq: 180, wave: 'sawtooth', duration: 0.14, gain: 0.2 });
    tone(c, { freq: 500, endFreq: 140, wave: 'sawtooth', duration: 0.16, gain: 0.18, delay: 0.1 });
  },
  REVERSE: (c) => {
    // Swoosh up then down — direction flip.
    tone(c, { freq: 300, endFreq: 760, wave: 'triangle', duration: 0.16, gain: 0.2 });
    tone(c, { freq: 760, endFreq: 300, wave: 'triangle', duration: 0.18, gain: 0.18, delay: 0.14 });
  },
  DRAW_TWO: (c) => {
    // Two quick "draw" blips.
    tone(c, { freq: 440, endFreq: 380, wave: 'square', duration: 0.1, gain: 0.16 });
    tone(c, { freq: 440, endFreq: 380, wave: 'square', duration: 0.1, gain: 0.16, delay: 0.13 });
  },
  WILD: (c) => {
    // Bright ascending sparkle arpeggio.
    [523, 659, 784, 988].forEach((f, i) => tone(c, { freq: f, wave: 'triangle', duration: 0.16, gain: 0.16, delay: i * 0.06 }));
  },
  WILD_DRAW_TWO: (c) => {
    [523, 659, 784].forEach((f, i) => tone(c, { freq: f, wave: 'triangle', duration: 0.14, gain: 0.16, delay: i * 0.06 }));
    tone(c, { freq: 440, endFreq: 360, wave: 'square', duration: 0.1, gain: 0.16, delay: 0.24 });
    tone(c, { freq: 440, endFreq: 360, wave: 'square', duration: 0.1, gain: 0.16, delay: 0.36 });
  },
  WILD_DRAW_FOUR: (c) => {
    // Dramatic low boom plus a bright stab chord.
    thud(c, { duration: 0.35, gain: 0.32 });
    [392, 494, 587, 698].forEach((f) => tone(c, { freq: f, wave: 'sawtooth', duration: 0.3, gain: 0.12, delay: 0.03 }));
  },
  WILD_DRAW_EIGHT: (c) => {
    // The biggest card in the deck — double boom plus a full descending-then-rising stab chord.
    thud(c, { duration: 0.4, gain: 0.36 });
    thud(c, { duration: 0.4, gain: 0.3, delay: 0.08 });
    [392, 494, 587, 698, 880].forEach((f, i) => tone(c, { freq: f, wave: 'sawtooth', duration: 0.32, gain: 0.13, delay: 0.05 + i * 0.015 }));
  },
};

/** Play the synthesized SFX for a given card kind (no-op for NUMBER or unknown kinds). */
export function playCardSound(kind: string) {
  const c = getCtx();
  if (!c) return;
  const play = PLAYERS[kind];
  if (!play) return;
  try {
    play(c);
  } catch {
    // Autoplay-policy or audio errors should never break gameplay.
  }
}

/** Per-player pitch so everyone's "pop" sounds a little different (stable for a given id). */
export function popPitchFor(id: string | null | undefined): number {
  let h = 0;
  for (const ch of id ?? '') h = (h * 31 + ch.charCodeAt(0)) | 0;
  const steps = [0, 2, 4, 5, 7, 9, 11, 12]; // major-scale steps → pleasant variety
  return Math.pow(2, steps[Math.abs(h) % steps.length] / 12);
}

/** Short bubbly "pop" for a card hitting the pile (`count` cards → that many quick pops, max 4). */
export function playPop(pitch = 1, count = 1) {
  playPopClip(pitch, count);
}
