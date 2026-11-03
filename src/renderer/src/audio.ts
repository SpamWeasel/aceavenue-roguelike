import type { SoundId } from "../../game/game";

/** Small synthesized sound effects; nothing is loaded from disk. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let muted = false;
/** 0-1. */
let volume = 0.7;
let musicVolume = 0.5;

export function setVolume(value: number): void {
  volume = Math.max(0, Math.min(1, value));
  if (master) master.gain.value = volume;
}

export function setMusicVolume(value: number): void {
  musicVolume = Math.max(0, Math.min(1, value));
  if (musicGain) musicGain.gain.value = musicVolume * 0.5;
}

/** The shared audio context and the music bus, or null when audio is off or unavailable. */
export function musicBus(): { ctx: AudioContext; out: GainNode } | null {
  if (muted || musicVolume <= 0) return null;
  const a = context();
  return a && musicGain ? { ctx: a, out: musicGain } : null;
}

function context(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = musicVolume * 0.5;
      musicGain.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setMuted(value: boolean): void {
  muted = value;
}

function audio(): AudioContext | null {
  if (muted) return null;
  const a = context();
  return a && volume > 0 ? a : null;
}

function tone(
  freq: number,
  to: number,
  dur: number,
  type: OscillatorType,
  vol = 0.12,
  delay = 0,
): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master as GainNode);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, cutoff: number, vol = 0.2, delay = 0, high = false): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = high ? "highpass" : "lowpass";
  f.frequency.value = cutoff;
  const g = a.createGain();
  g.gain.value = vol;
  src
    .connect(f)
    .connect(g)
    .connect(master as GainNode);
  src.start(t);
}

const arpeggio = (notes: number[], step: number, type: OscillatorType = "square", vol = 0.05) =>
  notes.forEach((f, i) => tone(f, f, step * 1.6, type, vol, i * step));

export function play(id: SoundId): void {
  switch (id) {
    case "card":
      noise(0.05, 4000, 0.18, 0, true);
      break;
    case "chip":
      tone(2400, 2200, 0.03, "triangle", 0.08);
      tone(2900, 2700, 0.03, "triangle", 0.06, 0.03);
      break;
    case "shuffle":
      for (let i = 0; i < 8; i++) noise(0.03, 3500, 0.12, i * 0.035, true);
      break;
    case "win":
      arpeggio([660, 880], 0.08, "triangle", 0.1);
      break;
    case "bigwin":
      arpeggio([523, 659, 784, 1047, 1319], 0.07);
      break;
    case "jackpot":
      for (let r = 0; r < 3; r++) arpeggio([784, 988, 1175, 1568], 0.06, "square", 0.05);
      tone(1568, 1568, 0.6, "square", 0.04, 0.8);
      break;
    case "lose":
      tone(330, 160, 0.35, "triangle", 0.12);
      break;
    case "tick":
      tone(1800, 1600, 0.015, "square", 0.03);
      break;
    case "dice":
      for (let i = 0; i < 5; i++) noise(0.04, 1800, 0.25, i * 0.05);
      break;
    case "deny":
      tone(110, 100, 0.18, "square", 0.07);
      break;
    case "door":
      tone(500, 300, 0.05, "square", 0.04);
      break;
    case "buy":
      tone(660, 660, 0.08, "triangle", 0.1);
      tone(880, 880, 0.12, "triangle", 0.1, 0.08);
      break;
    case "coin":
      tone(988, 988, 0.06, "square", 0.05);
      tone(1319, 1319, 0.12, "square", 0.05, 0.06);
      break;
    case "alarm":
      for (let i = 0; i < 3; i++) tone(880, 620, 0.18, "sawtooth", 0.05, i * 0.22);
      break;
    case "levelup":
      arpeggio([523, 659, 784, 1047], 0.07);
      break;
  }
}
