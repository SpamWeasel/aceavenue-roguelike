import { type Card, evalPoker, newDeck } from "./cards";
import type { Rng } from "./rng";

/**
 * Jacks or Better video poker: five cards, hold any, draw once. Machines differ only in their
 * pay table, and the pay table is printed right on the glass - a sharp player picks the 9/6 ones.
 */
export const VP_HANDS = [
  "Royal Flush",
  "Straight Flush",
  "Four of a Kind",
  "Full House",
  "Flush",
  "Straight",
  "Three of a Kind",
  "Two Pair",
  "Jacks or Better",
] as const;

export type VpTableId = "9/6" | "8/5" | "7/5" | "6/5";

export interface VpPaytable {
  id: VpTableId;
  /** Coins paid per coin bet, in VP_HANDS order. */
  pays: number[];
  /** Long-run payback with perfect play. */
  rtp: number;
}

export const VP_TABLES: Record<VpTableId, VpPaytable> = {
  "9/6": { id: "9/6", pays: [250, 50, 25, 9, 6, 4, 3, 2, 1], rtp: 0.9954 },
  "8/5": { id: "8/5", pays: [250, 50, 25, 8, 5, 4, 3, 2, 1], rtp: 0.973 },
  "7/5": { id: "7/5", pays: [250, 50, 25, 7, 5, 4, 3, 2, 1], rtp: 0.9615 },
  "6/5": { id: "6/5", pays: [250, 50, 25, 6, 5, 4, 3, 2, 1], rtp: 0.95 },
};

export const VP_MAX_COINS = 5;
/** A royal flush on five coins pays this per coin instead of 250. */
export const VP_ROYAL_MAX = 800;

/** Which line of the pay table a hand hits, or -1 for nothing. */
export function vpRank(cards: readonly Card[]): number {
  const v = evalPoker(cards);
  const ranks = cards.map((c) => c.rank);
  switch (v.cat) {
    case 8:
      return Math.min(...ranks) === 10 ? 0 : 1;
    case 7:
      return 2;
    case 6:
      return 3;
    case 5:
      return 4;
    case 4:
      return 5;
    case 3:
      return 6;
    case 2:
      return 7;
    case 1: {
      const pair = ranks.find((r, i) => ranks.indexOf(r) !== i) ?? 0;
      return pair >= 11 ? 8 : -1;
    }
    default:
      return -1;
  }
}

/** Coins returned for a final hand. */
export function vpPays(table: VpPaytable, cards: readonly Card[], coins: number): number {
  const r = vpRank(cards);
  if (r < 0) return 0;
  const perCoin = r === 0 && coins >= VP_MAX_COINS ? VP_ROYAL_MAX : table.pays[r];
  return perCoin * coins;
}

/** One hand: deal, hold, draw. */
export class VideoPokerHand {
  cards: Card[];
  held = [false, false, false, false, false];
  drawn = false;
  private deck: Card[];

  constructor(rng: Rng) {
    this.deck = rng.shuffle(newDeck());
    this.cards = this.deck.splice(0, 5);
  }

  toggle(i: number): void {
    if (!this.drawn) this.held[i] = !this.held[i];
  }

  draw(): void {
    if (this.drawn) return;
    this.cards = this.cards.map((c, i) => (this.held[i] ? c : (this.deck.shift() as Card)));
    this.drawn = true;
  }
}

const HIGH = (r: number) => r >= 11;

/**
 * A simple, nearly-perfect Jacks or Better strategy: which cards to hold.
 * Good enough to play at about 99% on a 9/6 machine.
 */
export function vpHint(cards: readonly Card[]): number[] {
  const all = [0, 1, 2, 3, 4];
  const r = vpRank(cards);
  const v = evalPoker(cards);
  // Made straights, flushes, full houses and better: keep them.
  if (r >= 0 && r <= 5) return r === 2 ? v.used : all;
  const bySuit = (suit: string) => all.filter((i) => cards[i].suit === suit);
  const suits = ["s", "h", "d", "c"];
  // Four to a royal flush.
  for (const s of suits) {
    const royal = bySuit(s).filter((i) => cards[i].rank >= 10);
    if (royal.length === 4) return royal;
  }
  if (r === 6) return v.used;
  // Four to a straight flush.
  for (const s of suits) {
    const idx = bySuit(s);
    for (const skip of idx.length === 5 ? idx : [-1]) {
      const keep = idx.filter((i) => i !== skip);
      if (keep.length !== 4) continue;
      const rs = keep.map((i) => cards[i].rank).sort((a, b) => a - b);
      const span = rs[3] - rs[0];
      const wheel = rs[3] === 14 && rs[2] <= 5;
      if (span <= 4 || wheel) return keep;
    }
  }
  if (r === 7 || r === 8) return v.used;
  // Three to a royal flush.
  for (const s of suits) {
    const royal = bySuit(s).filter((i) => cards[i].rank >= 10);
    if (royal.length === 3) return royal;
  }
  // Four to a flush.
  for (const s of suits) if (bySuit(s).length === 4) return bySuit(s);
  // A low pair.
  if (v.cat === 1) return v.used;
  // Four to an outside straight (open at both ends).
  for (const skip of all) {
    const keep = all.filter((i) => i !== skip);
    const rs = keep.map((i) => cards[i].rank).sort((a, b) => a - b);
    if (new Set(rs).size === 4 && rs[3] - rs[0] === 3 && rs[3] < 14 && rs[0] >= 2) return keep;
  }
  // Two suited high cards.
  for (const s of suits) {
    const hi = bySuit(s).filter((i) => HIGH(cards[i].rank));
    if (hi.length >= 2) return hi.slice(0, 2);
  }
  // High cards: keep the two lowest of them (more ways to pair up).
  const hi = all.filter((i) => HIGH(cards[i].rank)).sort((a, b) => cards[a].rank - cards[b].rank);
  if (hi.length >= 2) return hi.slice(0, 2);
  if (hi.length === 1) return hi;
  return [];
}
