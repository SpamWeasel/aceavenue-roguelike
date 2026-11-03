import { type Card, evalPoker, newDeck } from "./cards";
import type { Rng } from "./rng";

/**
 * Heads-up five-card draw with fixed bet sizes ("limit"): everyone antes, a betting round,
 * one draw of up to three cards (four when keeping an ace), a second betting round at double
 * size, then the showdown. The high rollers' play comes from their persona.
 */
export interface PokerPersona {
  /** 0-1: folds more often when facing a bet. */
  tight: number;
  /** 0-1: bets and raises good hands more eagerly. */
  aggro: number;
  /** 0-1: bets and raises with nothing. */
  bluff: number;
  /** 0-1: poker face; hides their tells from your Poker Read. */
  face: number;
}

export type Seat = "you" | "them";
export const other = (s: Seat): Seat => (s === "you" ? "them" : "you");
export type PokerPhase = "bet1" | "draw" | "bet2" | "done";
export type PokerAction = "check" | "bet" | "call" | "raise" | "fold";
export type TellKind = "strong" | "weak" | "neutral";

export interface PokerLimits {
  ante: number;
  small: number;
  big: number;
}

/** Bet sizes for a match with this stake. */
export function limitsFor(stake: number): PokerLimits {
  const small = Math.max(2, Math.round(stake / 25));
  return { ante: Math.max(1, Math.round(stake / 50)), small, big: small * 2 };
}

/** Most bets in one betting round: a bet and three raises. */
export const MAX_BETS = 4;

export interface PokerEvent {
  who: Seat;
  text: string;
}

/** How good a finished hand is, 0-1, heads-up. */
export function madeStrength(cards: readonly Card[]): number {
  const v = evalPoker(cards);
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const groupRank = (n: number) => {
    const counts = new Map<number, number>();
    for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
    let best = 0;
    for (const [r, k] of counts) if (k >= n && r > best) best = r;
    return best;
  };
  switch (v.cat) {
    case 0:
      return 0.02 + ((ranks[0] - 2) / 12) * 0.22 + ((ranks[1] - 2) / 12) * 0.03;
    case 1:
      return 0.3 + ((groupRank(2) - 2) / 12) * 0.35;
    case 2:
      return 0.68 + ((groupRank(2) - 2) / 12) * 0.12;
    case 3:
      return 0.82 + ((groupRank(3) - 2) / 12) * 0.06;
    case 4:
      return 0.9;
    case 5:
      return 0.93;
    case 6:
      return 0.96;
    case 7:
      return 0.99;
    default:
      return 1;
  }
}

/** Four cards of one suit: the index of the odd one out, or -1. */
export function flushDraw(cards: readonly Card[]): number {
  for (const suit of ["s", "h", "d", "c"]) {
    const off = cards.map((c, i) => (c.suit === suit ? -1 : i)).filter((i) => i >= 0);
    if (off.length === 1) return off[0];
  }
  return -1;
}

/** Four cards in a row (open at both ends): the index of the odd one out, or -1. */
export function straightDraw(cards: readonly Card[]): number {
  for (let skip = 0; skip < 5; skip++) {
    const r = cards
      .filter((_, i) => i !== skip)
      .map((c) => c.rank)
      .sort((a, b) => a - b);
    const distinct = new Set(r).size === 4;
    if (distinct && r[3] - r[0] === 3 && r[3] < 14 && r[0] > 2) return skip;
  }
  return -1;
}

/** How promising a hand is before the draw, 0-1. */
export function drawStrength(cards: readonly Card[]): number {
  const v = evalPoker(cards);
  if (v.cat >= 1) return madeStrength(cards);
  if (flushDraw(cards) >= 0) return 0.4;
  if (straightDraw(cards) >= 0) return 0.34;
  const top = Math.max(...cards.map((c) => c.rank));
  return 0.04 + ((top - 2) / 12) * 0.18;
}

/** Biggest discard allowed: three cards, or four when the card kept is an ace. */
export function discardAllowed(cards: readonly Card[], discard: readonly number[]): boolean {
  if (discard.length <= 3) return true;
  if (discard.length > 4) return false;
  const kept = cards.find((_, i) => !discard.includes(i));
  return kept?.rank === 14;
}

/** One hand of a match. Stacks are this hand's copies; the match takes them back at the end. */
export class PokerHand {
  private deck: Card[];
  cards: Record<Seat, Card[]> = { you: [], them: [] };
  committed: Record<Seat, number> = { you: 0, them: 0 };
  acted: Record<Seat, boolean> = { you: false, them: false };
  drew: Record<Seat, number | null> = { you: null, them: null };
  pot = 0;
  phase: PokerPhase = "bet1";
  toAct: Seat;
  bets = 0;
  folded: Seat | null = null;
  winner: Seat | "split" | null = null;
  /** What each side took from the pot. */
  won: Record<Seat, number> = { you: 0, them: 0 };
  events: PokerEvent[] = [];
  /** Who bet or raised last in the final round (for reading bluffs at the showdown). */
  lastAggressor: Seat | null = null;
  /** The AI stood pat with nothing. */
  bluffPat = false;

  constructor(
    private rng: Rng,
    readonly stacks: Record<Seat, number>,
    readonly dealer: Seat,
    readonly limits: PokerLimits,
    readonly persona: PokerPersona,
    /** Your Poker Face skill (0-3+): they believe your bets a little more. */
    private playerFace: number,
    /** How much they suspect you of bluffing, from earlier showdowns. */
    private suspicion: number,
  ) {
    this.deck = rng.shuffle(newDeck());
    for (const s of ["you", "them"] as const) {
      const a = Math.min(limits.ante, this.stacks[s]);
      this.stacks[s] -= a;
      this.pot += a;
    }
    for (let i = 0; i < 5; i++) {
      this.cards.you.push(this.deck.pop() as Card);
      this.cards.them.push(this.deck.pop() as Card);
    }
    this.toAct = other(dealer);
    this.skipIfAllIn();
  }

  get firstToAct(): Seat {
    return other(this.dealer);
  }

  betSize(): number {
    return this.phase === "bet2" ? this.limits.big : this.limits.small;
  }

  toCall(seat: Seat): number {
    return Math.max(0, this.committed[other(seat)] - this.committed[seat]);
  }

  canRaise(seat: Seat): boolean {
    return (
      this.bets < MAX_BETS &&
      this.stacks[seat] > this.toCall(seat) &&
      this.stacks[other(seat)] > 0 &&
      this.stacks[other(seat)] + this.committed[other(seat)] > this.committed[seat]
    );
  }

  /** Actions the seat to act may take. */
  options(): PokerAction[] {
    if (this.phase !== "bet1" && this.phase !== "bet2") return [];
    const s = this.toAct;
    if (this.toCall(s) > 0) return this.canRaise(s) ? ["call", "raise", "fold"] : ["call", "fold"];
    return this.canRaise(s) ? ["check", "bet"] : ["check"];
  }

  private put(seat: Seat, amount: number): number {
    const a = Math.min(amount, this.stacks[seat]);
    this.stacks[seat] -= a;
    this.committed[seat] += a;
    this.pot += a;
    return a;
  }

  act(action: PokerAction): void {
    if (!this.options().includes(action)) return;
    const s = this.toAct;
    const o = other(s);
    switch (action) {
      case "fold":
        this.events.push({ who: s, text: "folds" });
        this.folded = s;
        this.award(o);
        return;
      case "check":
        this.events.push({ who: s, text: "checks" });
        this.acted[s] = true;
        break;
      case "call": {
        const paid = this.put(s, this.toCall(s));
        this.events.push({
          who: s,
          text: `calls $${paid}${this.stacks[s] === 0 ? " (all in)" : ""}`,
        });
        this.acted[s] = true;
        break;
      }
      case "bet":
      case "raise": {
        this.put(s, this.toCall(s) + this.betSize());
        this.bets++;
        this.events.push({
          who: s,
          text: `${action === "bet" ? "bets" : "raises to"} $${this.committed[s]}${this.stacks[s] === 0 ? " (all in)" : ""}`,
        });
        this.acted[s] = true;
        this.acted[o] = false;
        if (this.phase === "bet2") this.lastAggressor = s;
        break;
      }
    }
    const level = this.committed.you === this.committed.them;
    const someoneAllIn = this.stacks.you === 0 || this.stacks.them === 0;
    if ((this.acted.you && this.acted.them && level) || (action === "call" && someoneAllIn)) {
      this.endRound();
    } else this.toAct = o;
  }

  private endRound(): void {
    this.committed = { you: 0, them: 0 };
    this.acted = { you: false, them: false };
    this.bets = 0;
    if (this.phase === "bet1") {
      this.phase = "draw";
      this.toAct = this.firstToAct;
    } else this.showdown();
  }

  /** Skips a betting round when someone has nothing left to bet. */
  private skipIfAllIn(): void {
    if (
      (this.phase === "bet1" || this.phase === "bet2") &&
      (this.stacks.you === 0 || this.stacks.them === 0)
    )
      this.endRound();
  }

  /** Swaps the chosen cards for new ones. */
  draw(seat: Seat, discard: readonly number[]): void {
    if (this.phase !== "draw" || this.toAct !== seat || this.drew[seat] !== null) return;
    for (const i of discard) this.cards[seat][i] = this.deck.pop() as Card;
    this.drew[seat] = discard.length;
    this.events.push({
      who: seat,
      text: discard.length === 0 ? "stands pat" : `draws ${discard.length}`,
    });
    if (this.drew[other(seat)] === null) this.toAct = other(seat);
    else {
      this.phase = "bet2";
      this.toAct = this.firstToAct;
      this.skipIfAllIn();
    }
  }

  private showdown(): void {
    const y = evalPoker(this.cards.you).score;
    const t = evalPoker(this.cards.them).score;
    if (y === t) {
      const half = Math.floor(this.pot / 2);
      this.won = { you: half, them: half };
      // The odd chip goes to the player left of the dealer.
      this.won[this.firstToAct] += this.pot - half * 2;
      this.stacks.you += this.won.you;
      this.stacks.them += this.won.them;
      this.winner = "split";
      this.pot = 0;
      this.phase = "done";
    } else this.award(y > t ? "you" : "them");
  }

  private award(seat: Seat): void {
    this.won[seat] = this.pot;
    this.stacks[seat] += this.pot;
    this.pot = 0;
    this.winner = seat;
    this.phase = "done";
  }

  /** True when the hand went to a showdown (nobody folded). */
  get showdownHappened(): boolean {
    return this.phase === "done" && this.folded === null;
  }

  // -------------------------------------------------------------------------------------------
  // The high roller's side

  /** Their honest opinion of their hand right now, 0-1. */
  rawStrength(): number {
    const c = this.cards.them;
    return this.phase === "bet1" || (this.phase === "draw" && this.drew.them === null)
      ? drawStrength(c)
      : madeStrength(c);
  }

  /** Their strength after guessing what your draw means. */
  private judgedStrength(): number {
    let h = this.rawStrength();
    const yd = this.drew.you;
    if (this.phase === "bet2" && yd !== null) {
      h += yd === 0 ? -0.18 : yd === 1 ? -0.05 : yd === 2 ? -0.1 : 0.06;
    }
    return h;
  }

  aiAction(): PokerAction {
    const opts = this.options();
    const p = this.persona;
    const h = this.judgedStrength();
    const r = this.rng.next();
    const late = this.phase === "bet2";
    if (!opts.includes("call")) {
      if (!opts.includes("bet")) return "check";
      const valueAt = (late ? 0.58 : 0.6) - p.aggro * 0.22;
      if (h >= valueAt) return h > 0.9 && r < 0.2 ? "check" : "bet";
      if (r < p.bluff * (late ? 0.55 : 0.3)) return "bet";
      return "check";
    }
    const toCall = this.toCall("them");
    const odds = toCall / (this.pot + toCall);
    let callAt = 0.28 + p.tight * 0.22 + this.bets * 0.06 + this.playerFace * 0.03;
    if (late) callAt += 0.04;
    callAt -= Math.min(0.16, this.suspicion * 0.04);
    const raiseAt = 0.8 - p.aggro * 0.2 + Math.max(0, this.bets - 1) * 0.07;
    if (h >= raiseAt && opts.includes("raise")) return "raise";
    if (h >= callAt) return "call";
    if (odds < 0.2 && h >= callAt - 0.12) return "call";
    if (opts.includes("raise") && r < p.bluff * 0.1) return "raise";
    if (r < (1 - p.tight) * 0.12) return "call";
    return "fold";
  }

  /** Which cards they throw away. */
  aiDiscards(): number[] {
    const c = this.cards.them;
    const v = evalPoker(c);
    const all = [0, 1, 2, 3, 4];
    if (v.cat >= 4) return [];
    if (v.cat >= 1) {
      const keep = new Set(v.used);
      return all.filter((i) => !keep.has(i));
    }
    if (this.rng.next() < this.persona.bluff * 0.12) {
      this.bluffPat = true;
      return [];
    }
    const f = flushDraw(c);
    if (f >= 0) return [f];
    const s = straightDraw(c);
    if (s >= 0) return [s];
    const order = all.sort((a, b) => c[b].rank - c[a].rank);
    if (c[order[0]].rank === 14) return order.slice(1);
    return order.slice(2);
  }

  /** What their face and hands give away, as the Poker Read skill sees it. */
  tell(read: number, knownTell: boolean, rng: Rng): TellKind {
    const h = this.rawStrength();
    const truth: TellKind = this.bluffPat || h < 0.36 ? "weak" : h > 0.62 ? "strong" : "neutral";
    const accuracy = Math.max(
      0.2,
      Math.min(0.95, 0.5 + read * 0.15 + (knownTell ? 0.2 : 0) - this.persona.face * 0.3),
    );
    if (rng.chance(accuracy)) return truth;
    const kinds: TellKind[] = ["strong", "weak", "neutral"];
    return rng.pick(kinds.filter((k) => k !== truth));
  }
}

/** A whole heads-up match: both sides start with the stake and play until one is broke. */
export class PokerMatch {
  stacks: Record<Seat, number>;
  dealer: Seat = "them";
  hand: PokerHand | null = null;
  hands = 0;
  /** Grows each time you're caught bluffing at a showdown; they call you down more. */
  suspicion = 0;
  readonly limits: PokerLimits;

  constructor(
    private rng: Rng,
    readonly stake: number,
    readonly persona: PokerPersona,
    private playerFace: number,
  ) {
    this.stacks = { you: stake, them: stake };
    this.limits = limitsFor(stake);
  }

  newHand(): PokerHand {
    this.dealer = other(this.dealer);
    this.hand = new PokerHand(
      this.rng,
      { ...this.stacks },
      this.dealer,
      this.limits,
      this.persona,
      this.playerFace,
      this.suspicion,
    );
    return this.hand;
  }

  /** Takes the finished hand's stacks back and learns from what was shown. */
  finishHand(): void {
    const h = this.hand;
    if (h?.phase !== "done") return;
    this.stacks = { ...h.stacks };
    this.hands++;
    if (h.showdownHappened && h.lastAggressor === "you") {
      const yours = madeStrength(h.cards.you);
      if (yours < 0.36) this.suspicion++;
      else if (yours > 0.66) this.suspicion = Math.max(0, this.suspicion - 1);
    }
  }

  /** Who won the match, once one side is out of money. */
  winner(): Seat | null {
    if (this.stacks.them <= 0) return "you";
    if (this.stacks.you <= 0) return "them";
    return null;
  }
}
