import type { Rng } from "./rng";

/** Reel symbols. The pays table is per coin, for three in a row on the center line. */
export const SYMBOLS = ["blank", "cherry", "plum", "bell", "bar", "seven"] as const;
export type SlotSymbol = (typeof SYMBOLS)[number];

export const THREE_PAYS: Record<Exclude<SlotSymbol, "blank">, number> = {
  seven: 150,
  bar: 40,
  bell: 18,
  plum: 12,
  cherry: 10,
};
/** Two cherries anywhere on the line pay this; one cherry pays its own coin back twice. */
export const TWO_CHERRY = 4;
export const ONE_CHERRY = 2;
/** Three sevens with the maximum bet pays this per coin instead. */
export const MAX_COINS = 3;
export const JACKPOT_MAX_BET = 250;

/** How many of each symbol is on a reel (blanks are tuned per machine). */
const COUNTS: Record<Exclude<SlotSymbol, "blank">, number> = {
  cherry: 10,
  plum: 10,
  bell: 7,
  bar: 5,
  seven: 2,
};

/** Coins returned per coin played for these three symbols. */
export function linePays(line: readonly SlotSymbol[], coins = 1): number {
  if (line[0] !== "blank" && line.every((s) => s === line[0])) {
    if (line[0] === "seven" && coins >= MAX_COINS) return JACKPOT_MAX_BET;
    return THREE_PAYS[line[0] as Exclude<SlotSymbol, "blank">];
  }
  const cherries = line.filter((s) => s === "cherry").length;
  return cherries === 2 ? TWO_CHERRY : cherries === 1 ? ONE_CHERRY : 0;
}

/** Exact payback (coins returned per coin played, one-coin bets) for a reel with `blanks`. */
export function payback(blanks: number): number {
  const total = blanks + Object.values(COUNTS).reduce((a, b) => a + b, 0);
  const p: Record<SlotSymbol, number> = {
    blank: blanks / total,
    cherry: COUNTS.cherry / total,
    plum: COUNTS.plum / total,
    bell: COUNTS.bell / total,
    bar: COUNTS.bar / total,
    seven: COUNTS.seven / total,
  };
  let rtp = 0;
  for (const a of SYMBOLS)
    for (const b of SYMBOLS)
      for (const c of SYMBOLS) rtp += p[a] * p[b] * p[c] * linePays([a, b, c]);
  return rtp;
}

/** Blanks per reel giving a payback closest to `target`. */
export function blanksFor(target: number): number {
  let best = 0;
  let bestErr = Number.POSITIVE_INFINITY;
  for (let blanks = 4; blanks <= 120; blanks++) {
    const err = Math.abs(payback(blanks) - target);
    if (err < bestErr) {
      bestErr = err;
      best = blanks;
    }
  }
  return best;
}

/** A reel strip: symbols spread out with blanks between them, in a seeded order. */
export function buildReel(rng: Rng, blanks: number): SlotSymbol[] {
  const symbols: SlotSymbol[] = [];
  for (const [s, n] of Object.entries(COUNTS))
    for (let i = 0; i < n; i++) symbols.push(s as SlotSymbol);
  rng.shuffle(symbols);
  const reel: SlotSymbol[] = [];
  let placedBlanks = 0;
  for (let i = 0; i < symbols.length; i++) {
    reel.push(symbols[i]);
    // Spread the blanks evenly between the symbols.
    const want = Math.round(((i + 1) * blanks) / symbols.length);
    while (placedBlanks < want) {
      reel.push("blank");
      placedBlanks++;
    }
  }
  return reel;
}

export type Looseness = "tight" | "fair" | "loose";

export interface MachineDef {
  /** Payback per coin played, e.g. 0.88. */
  rtp: number;
  looseness: Looseness;
  reels: SlotSymbol[][];
}

export function makeMachine(rng: Rng, looseChance: number): MachineDef {
  const roll = rng.next();
  const looseness: Looseness = roll < looseChance ? "loose" : roll < 0.55 ? "fair" : "tight";
  const target =
    looseness === "loose"
      ? rng.range(0.99, 1.05)
      : looseness === "fair"
        ? rng.range(0.88, 0.93)
        : rng.range(0.78, 0.85);
  const blanks = blanksFor(target);
  const reels = [0, 1, 2].map(() => buildReel(rng, blanks));
  return { rtp: payback(blanks), looseness, reels };
}

/** Where each reel stops (index of the symbol on the center line). */
export function spinReels(m: MachineDef, rng: Rng): number[] {
  return m.reels.map((r) => rng.int(0, r.length - 1));
}

export function symbolAt(reel: readonly SlotSymbol[], stop: number): SlotSymbol {
  const n = reel.length;
  return reel[((stop % n) + n) % n];
}

export function centerLine(m: MachineDef, stops: readonly number[]): SlotSymbol[] {
  return stops.map((s, i) => symbolAt(m.reels[i], s));
}
