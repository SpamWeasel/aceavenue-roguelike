import type { Rng } from "./rng";

/** Card suits: spades, hearts, diamonds, clubs. */
export type Suit = "s" | "h" | "d" | "c";
export const SUITS: readonly Suit[] = ["s", "h", "d", "c"];
export const SUIT_CHAR: Record<Suit, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

/** A playing card. Rank 2-14, where 11 = J, 12 = Q, 13 = K and 14 = A. */
export interface Card {
  rank: number;
  suit: Suit;
}

export const isRed = (c: Card) => c.suit === "h" || c.suit === "d";

export function rankName(rank: number): string {
  return rank === 14
    ? "A"
    : rank === 13
      ? "K"
      : rank === 12
        ? "Q"
        : rank === 11
          ? "J"
          : String(rank);
}

const RANK_WORD = [
  "",
  "",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Jack",
  "Queen",
  "King",
  "Ace",
];
const plural = (rank: number) => (rank === 6 ? "Sixes" : `${RANK_WORD[rank]}s`);

export const cardName = (c: Card) => `${rankName(c.rank)}${SUIT_CHAR[c.suit]}`;

export function newDeck(): Card[] {
  const out: Card[] = [];
  for (const suit of SUITS) for (let rank = 2; rank <= 14; rank++) out.push({ rank, suit });
  return out;
}

/** Hi-Lo card counting: small cards out help the player (+1), tens and aces hurt (-1). */
export function hiLo(c: Card): number {
  if (c.rank <= 6) return 1;
  if (c.rank >= 10) return -1;
  return 0;
}

/**
 * A blackjack shoe of several decks. Keeps a Hi-Lo running count so the Card Sense skill
 * can show it, and reshuffles after `penetration` of the cards are dealt.
 */
export class Shoe {
  cards: Card[] = [];
  running = 0;
  private dealtCount = 0;

  constructor(
    readonly decks: number,
    private rng: Rng,
    readonly penetration = 0.75,
  ) {
    this.shuffle();
  }

  shuffle(): void {
    this.cards = [];
    for (let i = 0; i < this.decks; i++) this.cards.push(...newDeck());
    this.rng.shuffle(this.cards);
    this.running = 0;
    this.dealtCount = 0;
  }

  get total(): number {
    return this.decks * 52;
  }

  /** True when the cut card has come out: shuffle before the next round. */
  needsShuffle(): boolean {
    return this.dealtCount >= this.total * this.penetration;
  }

  draw(count = true): Card {
    if (this.cards.length === 0) this.shuffle();
    const c = this.cards.pop() as Card;
    this.dealtCount++;
    if (count) this.running += hiLo(c);
    return c;
  }

  /** Counts a card that was dealt face down earlier and is now shown. */
  reveal(c: Card): void {
    this.running += hiLo(c);
  }

  decksLeft(): number {
    return Math.max(0.5, this.cards.length / 52);
  }

  /** Running count divided by decks left, rounded down toward zero. */
  trueCount(): number {
    return Math.trunc(this.running / this.decksLeft());
  }
}

/** Blackjack total: aces count 11 when that doesn't bust. */
export function bjTotal(cards: readonly Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 14) {
      aces++;
      total += 11;
    } else total += Math.min(10, c.rank);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isBlackjack = (cards: readonly Card[]) =>
  cards.length === 2 && bjTotal(cards).total === 21;

/** Blackjack value of a single card (ace 11, faces 10). */
export const bjCardValue = (c: Card) => (c.rank === 14 ? 11 : Math.min(10, c.rank));

// ---------------------------------------------------------------------------------------------
// Poker hands

export const POKER_CATEGORY = [
  "High Card",
  "One Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
] as const;

export interface PokerValue {
  /** 0 high card ... 8 straight flush. */
  cat: number;
  /** Bigger is better; compares any two five-card hands. */
  score: number;
  name: string;
  /** Which of the five cards make the hand (pairs, trips...); all five for straights/flushes. */
  used: number[];
}

/** Scores a five-card poker hand. */
export function evalPoker(cards: readonly Card[]): PokerValue {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  // Ranks grouped by how many of each, biggest groups and ranks first.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const distinct = [...counts.keys()].sort((a, b) => b - a);
  let straightHigh = 0;
  if (distinct.length === 5) {
    if (distinct[0] - distinct[4] === 4) straightHigh = distinct[0];
    else if (distinct[0] === 14 && distinct[1] === 5) straightHigh = 5; // A-2-3-4-5
  }
  let cat: number;
  let ranks: number[];
  if (straightHigh && flush) {
    cat = 8;
    ranks = [straightHigh];
  } else if (groups[0][1] === 4) {
    cat = 7;
    ranks = [groups[0][0], groups[1][0]];
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    cat = 6;
    ranks = [groups[0][0], groups[1][0]];
  } else if (flush) {
    cat = 5;
    ranks = distinct;
  } else if (straightHigh) {
    cat = 4;
    ranks = [straightHigh];
  } else if (groups[0][1] === 3) {
    cat = 3;
    ranks = groups.map((g) => g[0]);
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    cat = 2;
    ranks = groups.map((g) => g[0]);
  } else if (groups[0][1] === 2) {
    cat = 1;
    ranks = groups.map((g) => g[0]);
  } else {
    cat = 0;
    ranks = distinct;
  }
  let score = cat;
  for (let i = 0; i < 5; i++) score = score * 15 + (ranks[i] ?? 0);
  const used =
    cat === 0
      ? [cards.findIndex((c) => c.rank === distinct[0])]
      : cat >= 4 && cat !== 7
        ? [0, 1, 2, 3, 4]
        : cards.map((c, i) => ((counts.get(c.rank) ?? 0) >= 2 ? i : -1)).filter((i) => i >= 0);
  return { cat, score, name: pokerName(cat, ranks), used };
}

function pokerName(cat: number, r: number[]): string {
  switch (cat) {
    case 0:
      return `${RANK_WORD[r[0]]}-high`;
    case 1:
      return `Pair of ${plural(r[0])}`;
    case 2:
      return `Two Pair, ${plural(r[0])} and ${plural(r[1])}`;
    case 3:
      return `Three ${plural(r[0])}`;
    case 4:
      return `Straight, ${RANK_WORD[r[0]]}-high`;
    case 5:
      return `Flush, ${RANK_WORD[r[0]]}-high`;
    case 6:
      return `Full House, ${plural(r[0])} over ${plural(r[1])}`;
    case 7:
      return `Four ${plural(r[0])}`;
    default:
      return r[0] === 14 ? "Royal Flush" : `Straight Flush, ${RANK_WORD[r[0]]}-high`;
  }
}
