import { type BjMove, type BjOutcome, type BjRules, basicStrategy } from "./blackjack";
import { bjTotal, type Card, isBlackjack, type Shoe } from "./cards";
import {
  type Entrant,
  PRIZES,
  TOURNEY_CHIPS,
  TOURNEY_HANDS,
  TOURNEY_MAX,
  TOURNEY_MIN,
  type TStyle,
} from "./data/tourney";
import type { Rng } from "./rng";

/**
 * A blackjack tournament (0.4). Five players share one dealer. Everyone starts with the same
 * tournament chips (they aren't money) and plays a fixed number of hands; whoever has the most
 * chips at the end wins the prize. Tournament rules keep it quick: six decks, the dealer stands
 * on soft 17, blackjack pays 3:2, double on any two cards, no splits and no insurance. A player
 * who can't cover the minimum bet is out.
 *
 * What makes it a tournament is the betting: you're playing the other players, not the house.
 * The computer players bet by their style, and in the last few hands the leaders protect their
 * lead while everyone behind them swings for it.
 */
export const TOURNEY_RULES: BjRules = { decks: 6, h17: false, bjPays: 1.5, das: false };

export interface TSeat {
  e: Entrant;
  you: boolean;
  chips: number;
  bet: number;
  cards: Card[];
  doubled: boolean;
  done: boolean;
  /** Can't cover the minimum bet: out of the tournament. */
  out: boolean;
  result: BjOutcome | null;
  /** Chips won or lost on the last hand. */
  net: number;
}

export type TPhase = "bet" | "play" | "done" | "over";

export interface TourneyOptions {
  hands: number;
  chips: number;
  min: number;
  max: number;
}

const STYLE_SHARE: Record<TStyle, number> = { cautious: 0.05, steady: 0.1, wild: 0.22 };

export class Tournament {
  seats: TSeat[];
  dealer: Card[] = [];
  holeHidden = true;
  /** Hands dealt so far. */
  hand = 0;
  phase: TPhase = "bet";
  /** The seat whose turn it is during play, or -1. */
  turn = -1;
  readonly opts: TourneyOptions;

  constructor(
    private rng: Rng,
    private shoe: Shoe,
    field: Entrant[],
    you: Entrant,
    opts: Partial<TourneyOptions> = {},
  ) {
    this.opts = {
      hands: TOURNEY_HANDS,
      chips: TOURNEY_CHIPS,
      min: TOURNEY_MIN,
      max: TOURNEY_MAX,
      ...opts,
    };
    const seat = (e: Entrant, isYou: boolean): TSeat => ({
      e,
      you: isYou,
      chips: this.opts.chips,
      bet: 0,
      cards: [],
      doubled: false,
      done: false,
      out: false,
      result: null,
      net: 0,
    });
    // You sit in the middle of the table.
    const others = field.map((e) => seat(e, false));
    const mid = Math.floor(others.length / 2);
    this.seats = [...others.slice(0, mid), seat(you, true), ...others.slice(mid)];
  }

  get you(): TSeat {
    return this.seats.find((s) => s.you) as TSeat;
  }

  /** Hands still to come, counting the next one. */
  get handsLeft(): number {
    return this.opts.hands - this.hand;
  }

  get playing(): TSeat[] {
    return this.seats.filter((s) => !s.out);
  }

  get upCard(): Card | undefined {
    return this.dealer[0];
  }

  /** The biggest bet a seat can make right now. */
  maxBet(s: TSeat): number {
    return Math.min(this.opts.max, s.chips);
  }

  /** What a computer player bets this hand. */
  aiBet(s: TSeat): number {
    const { min } = this.opts;
    const cap = this.maxBet(s);
    const left = this.handsLeft;
    const rivals = this.playing.filter((o) => o !== s);
    const best = rivals.length ? Math.max(...rivals.map((o) => o.chips)) : 0;
    let bet = s.chips * STYLE_SHARE[s.e.style] * this.rng.range(0.7, 1.3);
    if (left <= 3) {
      if (s.chips > best) {
        // Leading: protect it. A big lead only needs the minimum.
        const lead = s.chips - best;
        bet = lead > this.opts.max * left ? min : Math.max(min, bet * 0.6);
      } else {
        // Behind: bet enough to catch the leader if this hand (or the last few) go well.
        const need = best - s.chips + min;
        bet = left === 1 ? need : Math.max(bet, need / left);
        if (s.e.style === "wild") bet = Math.max(bet, s.chips * 0.35);
      }
    }
    bet = Math.round(bet / min) * min;
    return Math.max(min, Math.min(cap, bet));
  }

  /** Everyone bets (you bet `yours`) and the cards come out. */
  bet(yours: number): string | null {
    if (this.phase !== "bet") return "Not now.";
    const you = this.you;
    if (!you.out) {
      if (yours < this.opts.min) return `The minimum bet is ${this.opts.min}.`;
      if (yours > this.maxBet(you)) return `You can bet at most ${this.maxBet(you)}.`;
    }
    for (const s of this.playing) {
      s.bet = s.you ? yours : this.aiBet(s);
      s.chips -= s.bet;
    }
    this.deal();
    return null;
  }

  private deal(): void {
    if (this.shoe.needsShuffle()) this.shoe.shuffle();
    this.hand++;
    this.dealer = [];
    this.holeHidden = true;
    const seats = this.playing;
    for (const s of this.seats) {
      s.cards = [];
      s.doubled = false;
      s.done = s.out;
      s.result = null;
      s.net = 0;
    }
    for (let round = 0; round < 2; round++) {
      for (const s of seats) s.cards.push(this.shoe.draw());
      this.dealer.push(this.shoe.draw(round === 0));
    }
    this.phase = "play";
    for (const s of seats) if (isBlackjack(s.cards)) s.done = true;
    // With an ace or a ten showing, the dealer peeks: a blackjack ends the hand at once.
    if (isBlackjack(this.dealer)) {
      for (const s of seats) s.done = true;
      this.revealHole();
      this.settle();
      return;
    }
    this.turn = -1;
    this.advance();
  }

  /** The seat that has to act, if anyone. */
  current(): TSeat | null {
    return this.phase === "play" && this.turn >= 0 ? this.seats[this.turn] : null;
  }

  canDouble(s: TSeat): boolean {
    return s.cards.length === 2 && s.chips >= s.bet;
  }

  act(move: "H" | "S" | "D"): void {
    const s = this.current();
    if (!s) return;
    if (move === "D" && !this.canDouble(s)) move = "H";
    if (move === "H") {
      s.cards.push(this.shoe.draw());
      if (bjTotal(s.cards).total >= 21) s.done = true;
    } else if (move === "S") s.done = true;
    else {
      s.chips -= s.bet;
      s.bet *= 2;
      s.doubled = true;
      s.cards.push(this.shoe.draw());
      s.done = true;
    }
    if (s.done) this.advance();
  }

  /** What a computer player does with their hand: the book, with a little nerve at the end. */
  aiMove(): "H" | "S" | "D" {
    const s = this.current();
    const up = this.upCard;
    if (!s || !up) return "S";
    const m: BjMove = basicStrategy(s.cards, up, TOURNEY_RULES, this.canDouble(s), false);
    return m === "P" ? "H" : m;
  }

  private advance(): void {
    for (let i = this.turn + 1; i < this.seats.length; i++)
      if (!this.seats[i].done) {
        this.turn = i;
        return;
      }
    this.turn = -1;
    this.dealerPlays();
  }

  private revealHole(): void {
    if (!this.holeHidden) return;
    this.holeHidden = false;
    this.shoe.reveal(this.dealer[1]);
  }

  private dealerPlays(): void {
    this.revealHole();
    const live = this.playing.some((s) => bjTotal(s.cards).total <= 21 && !isBlackjack(s.cards));
    if (live) while (bjTotal(this.dealer).total < 17) this.dealer.push(this.shoe.draw());
    this.settle();
  }

  private settle(): void {
    const d = bjTotal(this.dealer).total;
    const dealerBj = isBlackjack(this.dealer);
    for (const s of this.playing) {
      const p = bjTotal(s.cards).total;
      const natural = isBlackjack(s.cards);
      let r: { outcome: BjOutcome; net: number };
      if (p > 21) r = { outcome: "bust", net: -s.bet };
      else if (natural && !dealerBj)
        r = { outcome: "blackjack", net: Math.floor(s.bet * TOURNEY_RULES.bjPays) };
      else if (natural && dealerBj) r = { outcome: "push", net: 0 };
      else if (dealerBj) r = { outcome: "lose", net: -s.bet };
      else if (d > 21 || p > d) r = { outcome: "win", net: s.bet };
      else if (p === d) r = { outcome: "push", net: 0 };
      else r = { outcome: "lose", net: -s.bet };
      s.result = r.outcome;
      s.net = r.net;
      s.chips += s.bet + r.net;
    }
    this.phase = "done";
  }

  /** On to the next hand, or the end of the tournament. */
  nextHand(): void {
    if (this.phase !== "done") return;
    for (const s of this.seats) {
      s.bet = 0;
      if (s.chips < this.opts.min) s.out = true;
    }
    this.phase = this.hand >= this.opts.hands || this.playing.length <= 1 ? "over" : "bet";
  }

  /** Once you're out, the others finish the tournament without you. */
  playOut(): void {
    for (let guard = 0; guard < 10000 && this.phase !== "over"; guard++) {
      if (this.phase === "bet") this.bet(0);
      else if (this.phase === "play") this.act(this.aiMove());
      else this.nextHand();
    }
  }

  /** A seat's chips, counting what's bet on the hand being played. */
  stack(s: TSeat): number {
    return s.chips + (this.phase === "play" ? s.bet : 0);
  }

  /** Everyone, most chips first. */
  standings(): TSeat[] {
    return [...this.seats].sort((a, b) => this.stack(b) - this.stack(a));
  }

  /** 1 for first; players tied on chips share the better place. */
  place(s: TSeat): number {
    return 1 + this.seats.filter((o) => this.stack(o) > this.stack(s)).length;
  }

  /** What a seat wins for a fee: tied players split the prizes for the places they share. */
  prize(s: TSeat, fee: number): number {
    const place = this.place(s);
    const tied = this.seats.filter((o) => o.chips === s.chips).length;
    let total = 0;
    for (let i = place - 1; i < place - 1 + tied; i++) total += (PRIZES[i] ?? 0) * fee;
    return Math.round(total / tied);
  }
}
