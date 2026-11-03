import type { Rng } from "./rng";

/** Pockets in wheel order. 37 stands for "00" on double-zero wheels. */
export const WHEEL_SINGLE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
export const WHEEL_DOUBLE = [
  0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8,
  19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2,
];

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const isRedNumber = (n: number) => RED.has(n);
export const pocketName = (n: number) => (n === 37 ? "00" : String(n));
export function pocketColor(n: number): "red" | "black" | "green" {
  return n === 0 || n === 37 ? "green" : RED.has(n) ? "red" : "black";
}

export type RouletteBetKind =
  | "straight"
  | "red"
  | "black"
  | "odd"
  | "even"
  | "low"
  | "high"
  | "dozen"
  | "column";

export interface RouletteBet {
  kind: RouletteBetKind;
  /** The number for "straight"; 1-3 for dozens and columns. */
  n: number;
  amount: number;
}

export const betKey = (b: { kind: RouletteBetKind; n: number }) => `${b.kind}:${b.n}`;

export function betLabel(b: { kind: RouletteBetKind; n: number }): string {
  switch (b.kind) {
    case "straight":
      return `Number ${pocketName(b.n)}`;
    case "dozen":
      return ["1st 12", "2nd 12", "3rd 12"][b.n - 1];
    case "column":
      return `Column ${b.n}`;
    case "low":
      return "1-18";
    case "high":
      return "19-36";
    default:
      return b.kind[0].toUpperCase() + b.kind.slice(1);
  }
}

/** Does the bet win on this pocket? */
export function betWins(b: { kind: RouletteBetKind; n: number }, pocket: number): boolean {
  if (b.kind === "straight") return pocket === b.n;
  if (pocket === 0 || pocket === 37) return false;
  switch (b.kind) {
    case "red":
      return RED.has(pocket);
    case "black":
      return !RED.has(pocket);
    case "odd":
      return pocket % 2 === 1;
    case "even":
      return pocket % 2 === 0;
    case "low":
      return pocket <= 18;
    case "high":
      return pocket >= 19;
    case "dozen":
      return Math.ceil(pocket / 12) === b.n;
    case "column":
      return ((pocket - 1) % 3) + 1 === b.n;
  }
}

/** Winnings for a winning bet, as a multiple of its stake (the stake comes back too). */
export function betOdds(kind: RouletteBetKind): number {
  return kind === "straight" ? 35 : kind === "dozen" || kind === "column" ? 2 : 1;
}

/** Money returned for a bet on this pocket (stake plus winnings, or nothing). */
export function betReturn(b: RouletteBet, pocket: number): number {
  return betWins(b, pocket) ? b.amount * (betOdds(b.kind) + 1) : 0;
}

/**
 * A wheel. Some wheels are worn so a few neighboring pockets come up more often; players with
 * Wheel Watch (or a sharp eye on the history) can find and bet them.
 */
export interface WheelDef {
  doubleZero: boolean;
  /** Pockets favored by a worn wheel (neighbors on the wheel), or empty. */
  bias: number[];
  /** How much more often a favored pocket comes up (1.15 = 15%). */
  biasWeight: number;
}

export function makeWheel(rng: Rng, doubleZero: boolean, biasChance: number): WheelDef {
  const order = doubleZero ? WHEEL_DOUBLE : WHEEL_SINGLE;
  if (!rng.chance(biasChance)) return { doubleZero, bias: [], biasWeight: 1 };
  const start = rng.int(0, order.length - 1);
  const bias = [0, 1, 2, 3, 4].map((k) => order[(start + k) % order.length]);
  return { doubleZero, bias, biasWeight: 1.15 };
}

export function spinWheel(w: WheelDef, rng: Rng): number {
  const order = w.doubleZero ? WHEEL_DOUBLE : WHEEL_SINGLE;
  if (!w.bias.length) return rng.pick(order);
  return rng.weighted(order.map((n) => [n, w.bias.includes(n) ? w.biasWeight : 1] as const));
}

/** The pockets a ball passes on its way to `result`, for the spinning animation. */
export function spinPath(w: WheelDef, result: number, steps: number): number[] {
  const order = w.doubleZero ? WHEEL_DOUBLE : WHEEL_SINGLE;
  const end = order.indexOf(result);
  const out: number[] = [];
  for (let i = steps; i >= 0; i--)
    out.push(order[(((end - i) % order.length) + order.length) % order.length]);
  return out;
}
