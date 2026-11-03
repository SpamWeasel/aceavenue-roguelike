import { bjCardValue, bjTotal, type Card, isBlackjack, type Shoe } from "./cards";

/** Table rules. They differ between casinos and between the high rollers. */
export interface BjRules {
  decks: number;
  /** Dealer hits soft 17 (worse for the player). */
  h17: boolean;
  /** What a natural blackjack pays: 1.5 (3:2), 1.2 (6:5) or 2 (2:1). */
  bjPays: number;
  /** Double after a split is allowed. */
  das: boolean;
}

export interface BjHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  done: boolean;
  /** Split aces get one card each and can't be hit again. */
  splitAces: boolean;
}

export type BjOutcome = "blackjack" | "win" | "push" | "lose" | "bust";

export interface BjResult {
  outcome: BjOutcome;
  /** Money won or lost on this hand (stake not included). */
  net: number;
}

export type BjPhase = "insurance" | "play" | "done";
export type BjMove = "H" | "S" | "D" | "P";

/**
 * One round of blackjack. The bet is already taken from the player when it starts; `payout`
 * says what goes back to them at the end (stakes plus winnings).
 */
export class BlackjackRound {
  hands: BjHand[];
  dealer: Card[] = [];
  active = 0;
  phase: BjPhase = "play";
  holeHidden = true;
  insurance = 0;
  /** Insurance paid back (stake + 2:1) if the dealer had blackjack. */
  insuranceReturn = 0;
  results: BjResult[] = [];
  /** Total returned to the player when the round is done. */
  payout = 0;
  /** Extra money taken for doubles and splits during the round. */
  extraStake = 0;
  /** The player holds a Four-Leaf Clover: the first card that would bust them is burned. */
  cloverArmed = false;
  /** The card the clover burned (for the screen to show), if any. */
  burned: Card | null = null;

  constructor(
    private shoe: Shoe,
    readonly rules: BjRules,
    bet: number,
  ) {
    this.hands = [{ cards: [], bet, doubled: false, done: false, splitAces: false }];
    const hand = this.hands[0].cards;
    hand.push(shoe.draw());
    this.dealer.push(shoe.draw());
    hand.push(shoe.draw());
    // The hole card is dealt face down: it isn't counted until it's turned over.
    this.dealer.push(shoe.draw(false));
    if (this.dealer[0].rank === 14) this.phase = "insurance";
    else this.peek();
  }

  get hand(): BjHand {
    return this.hands[this.active];
  }

  get upCard(): Card {
    return this.dealer[0];
  }

  /** Takes or skips insurance (costs half the bet), then the dealer checks for blackjack. */
  decideInsurance(take: boolean): void {
    if (this.phase !== "insurance") return;
    if (take) this.insurance = Math.floor(this.hands[0].bet / 2);
    this.peek();
  }

  /** The dealer checks for blackjack with a ten or ace showing; naturals end the round. */
  private peek(): void {
    const dealerBj = isBlackjack(this.dealer);
    const playerBj = isBlackjack(this.hands[0].cards);
    if (dealerBj || playerBj) {
      this.revealHole();
      if (dealerBj && this.insurance) this.insuranceReturn = this.insurance * 3;
      this.hands[0].done = true;
      this.settle();
      return;
    }
    this.phase = "play";
  }

  private revealHole(): void {
    if (!this.holeHidden) return;
    this.holeHidden = false;
    this.shoe.reveal(this.dealer[1]);
  }

  canDouble(): boolean {
    const h = this.hand;
    if (this.phase !== "play" || h.cards.length !== 2 || h.splitAces) return false;
    return this.hands.length === 1 || this.rules.das;
  }

  canSplit(): boolean {
    const h = this.hand;
    return (
      this.phase === "play" &&
      this.hands.length < 4 &&
      h.cards.length === 2 &&
      bjCardValue(h.cards[0]) === bjCardValue(h.cards[1]) &&
      !h.splitAces
    );
  }

  hit(): void {
    if (this.phase !== "play") return;
    const h = this.hand;
    h.cards.push(this.shoe.draw());
    if (bjTotal(h.cards).total > 21 && this.cloverArmed) {
      // The Four-Leaf Clover: the busting card goes to the discards and the hand stays open.
      this.burned = h.cards.pop() ?? null;
      this.cloverArmed = false;
      return;
    }
    if (bjTotal(h.cards).total >= 21) this.finishHand();
  }

  stand(): void {
    if (this.phase !== "play") return;
    this.finishHand();
  }

  /** Doubles the bet (the caller has already checked the player can afford it). */
  double(): void {
    if (!this.canDouble()) return;
    const h = this.hand;
    this.extraStake += h.bet;
    h.bet *= 2;
    h.doubled = true;
    h.cards.push(this.shoe.draw());
    this.finishHand();
  }

  split(): void {
    if (!this.canSplit()) return;
    const h = this.hand;
    const aces = h.cards[0].rank === 14;
    const second: BjHand = {
      cards: [h.cards.pop() as Card],
      bet: h.bet,
      doubled: false,
      done: false,
      splitAces: aces,
    };
    this.extraStake += h.bet;
    h.splitAces = aces;
    this.hands.splice(this.active + 1, 0, second);
    h.cards.push(this.shoe.draw());
    second.cards.push(this.shoe.draw());
    if (aces) {
      h.done = true;
      second.done = true;
      this.next();
    } else if (bjTotal(h.cards).total === 21) this.finishHand();
  }

  private finishHand(): void {
    this.hand.done = true;
    this.next();
  }

  private next(): void {
    while (this.active < this.hands.length && this.hands[this.active].done) this.active++;
    if (this.active < this.hands.length) return;
    this.active = this.hands.length - 1;
    this.dealerPlays();
  }

  private dealerPlays(): void {
    this.revealHole();
    const allBust = this.hands.every((h) => bjTotal(h.cards).total > 21);
    if (!allBust) {
      for (;;) {
        const { total, soft } = bjTotal(this.dealer);
        if (total > 17 || (total === 17 && !(soft && this.rules.h17))) break;
        this.dealer.push(this.shoe.draw());
      }
    }
    this.settle();
  }

  private settle(): void {
    const d = bjTotal(this.dealer).total;
    const dealerBj = isBlackjack(this.dealer);
    this.results = this.hands.map((h) => {
      const p = bjTotal(h.cards).total;
      const natural = isBlackjack(h.cards) && this.hands.length === 1;
      if (p > 21) return { outcome: "bust", net: -h.bet };
      if (natural && !dealerBj)
        return { outcome: "blackjack", net: Math.floor(h.bet * this.rules.bjPays) };
      if (dealerBj && !natural) return { outcome: "lose", net: -h.bet };
      if (natural && dealerBj) return { outcome: "push", net: 0 };
      if (d > 21 || p > d) return { outcome: "win", net: h.bet };
      if (p === d) return { outcome: "push", net: 0 };
      return { outcome: "lose", net: -h.bet };
    });
    this.payout =
      this.results.reduce((sum, r, i) => sum + this.hands[i].bet + r.net, 0) + this.insuranceReturn;
    this.phase = "done";
  }

  /** Total stake put down this round (bet, doubles, splits, insurance). */
  get staked(): number {
    return this.hands.reduce((s, h) => s + h.bet, 0) + this.insurance;
  }

  /** Money won or lost this round. */
  get net(): number {
    return this.payout - this.staked;
  }
}

/** What "the book" (basic strategy) says to do. */
export function basicStrategy(
  cards: readonly Card[],
  up: Card,
  rules: BjRules,
  canDouble: boolean,
  canSplit: boolean,
): BjMove {
  const d = bjCardValue(up);
  const { total, soft } = bjTotal(cards);
  const dbl = (otherwise: BjMove): BjMove => (canDouble ? "D" : otherwise);
  if (canSplit) {
    const v = bjCardValue(cards[0]);
    if (v === 11 || v === 8) return "P";
    if (v === 9 && d !== 7 && d < 10) return "P";
    if (v === 7 && d <= 7) return "P";
    if (v === 6 && d <= 6 && (rules.das || d >= 3)) return "P";
    if (v === 4 && rules.das && (d === 5 || d === 6)) return "P";
    if ((v === 2 || v === 3) && d <= 7 && (rules.das || d >= 4)) return "P";
  }
  if (soft && cards.length >= 2) {
    if (total >= 19) return total === 19 && d === 6 && rules.h17 ? dbl("S") : "S";
    if (total === 18) {
      if (d >= 3 && d <= 6) return dbl("S");
      return d >= 9 ? "H" : "S";
    }
    if (total === 17) return d >= 3 && d <= 6 ? dbl("H") : "H";
    if (total >= 15) return d >= 4 && d <= 6 ? dbl("H") : "H";
    if (total >= 13) return d >= 5 && d <= 6 ? dbl("H") : "H";
  }
  if (total >= 17) return "S";
  if (total >= 13) return d <= 6 ? "S" : "H";
  if (total === 12) return d >= 4 && d <= 6 ? "S" : "H";
  if (total === 11) return d === 11 && !rules.h17 ? "H" : dbl("H");
  if (total === 10) return d <= 9 ? dbl("H") : "H";
  if (total === 9) return d >= 3 && d <= 6 ? dbl("H") : "H";
  return "H";
}

export const MOVE_NAME: Record<BjMove, string> = {
  H: "Hit",
  S: "Stand",
  D: "Double",
  P: "Split",
};

export function rulesText(r: BjRules): string {
  const pays = r.bjPays === 2 ? "2:1" : r.bjPays === 1.2 ? "6:5" : "3:2";
  return `${r.decks === 1 ? "1 deck" : `${r.decks} decks`} · Dealer ${r.h17 ? "hits" : "stands on"} soft 17 · Blackjack pays ${pays}${r.das ? " · Double after split" : ""}`;
}
