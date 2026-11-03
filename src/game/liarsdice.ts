import { other, type PokerPersona, type Seat, type TellKind } from "./poker";
import type { Rng } from "./rng";

/**
 * Heads-up liar's dice. Each side has five dice under a cup. Taking turns, you bid how many dice
 * of one face are on the whole table (ones are wild: they count as every face), each bid higher
 * than the last, until someone calls "Liar!". The cups come up. If the bid holds, the caller
 * loses a die; if not, the bidder does. The loser opens the next round. Last one with dice wins
 * the whole pot. The high rollers play from the same persona as at poker: `tight` calls "Liar!"
 * sooner, `aggro` bids higher, `bluff` bids on faces they don't have, `face` hides their tells.
 */
export const DICE_EACH = 5;

export interface Bid {
  qty: number;
  /** 2-6; you can't bid on ones, they're wild. */
  face: number;
}

export interface DiceEvent {
  who: Seat;
  text: string;
}

/** What the cups showed when someone called "Liar!". */
export interface DiceReveal {
  bid: Bid;
  bidder: Seat;
  caller: Seat;
  /** How many of the bid face (ones included) were really there. */
  count: number;
  loser: Seat;
}

const FACE_ONE = ["", "one", "two", "three", "four", "five", "six"];
const FACE_MANY = ["", "ones", "twos", "threes", "fours", "fives", "sixes"];

/** "3 fives", "1 six". */
export function bidText(b: Bid): string {
  return `${b.qty} ${b.qty === 1 ? FACE_ONE[b.face] : FACE_MANY[b.face]}`;
}

/** Is `b` a legal bid after `last`? More dice, or the same number of a higher face. */
export function beats(b: Bid, last: Bid | null): boolean {
  if (b.face < 2 || b.face > 6 || b.qty < 1) return false;
  if (!last) return true;
  return b.qty > last.qty || (b.qty === last.qty && b.face > last.face);
}

/** The fewest dice you can bid on a face after `last`. */
export function minQty(face: number, last: Bid | null): number {
  if (!last) return 1;
  return face > last.face ? last.qty : last.qty + 1;
}

/** Dice showing a face, counting ones as wild. */
export function countFace(dice: readonly number[], face: number): number {
  return dice.filter((d) => d === face || d === 1).length;
}

/** Chance that at least `k` of `n` hidden dice show a face (each one does 1 time in 3). */
export function atLeast(n: number, k: number, p = 1 / 3): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let total = 0;
  let c = 1;
  for (let i = 0; i <= n; i++) {
    if (i >= k) total += c * p ** i * (1 - p) ** (n - i);
    c = (c * (n - i)) / (i + 1);
  }
  return Math.min(1, total);
}

/** `atLeast` for a fractional count, sliding between the two whole numbers around it. */
function atLeastSoft(n: number, k: number): number {
  const lo = Math.floor(k);
  const f = k - lo;
  return atLeast(n, lo) * (1 - f) + atLeast(n, lo + 1) * f;
}

export function rollDice(rng: Rng, n: number, loaded = false): number[] {
  // Loaded dice come up six far more often than they should.
  return Array.from({ length: n }, () => (loaded && rng.chance(0.55) ? 6 : rng.int(1, 6)));
}

/** One round: roll, bid, until somebody calls. */
export class DiceRound {
  dice: Record<Seat, number[]>;
  bids: { who: Seat; bid: Bid }[] = [];
  toAct: Seat;
  reveal: DiceReveal | null = null;
  events: DiceEvent[] = [];
  /** Faces where they've read from your face exactly how many you hold. */
  private readYou = new Map<number, number>();

  constructor(
    private rng: Rng,
    counts: Record<Seat, number>,
    readonly opener: Seat,
    readonly persona: PokerPersona,
    private playerFace: number,
    private suspicion: number,
    loaded = false,
  ) {
    this.dice = {
      you: rollDice(rng, counts.you, loaded).sort((a, b) => a - b),
      them: rollDice(rng, counts.them).sort((a, b) => a - b),
    };
    this.toAct = opener;
  }

  get last(): Bid | null {
    return this.bids.length ? this.bids[this.bids.length - 1].bid : null;
  }

  get lastBidder(): Seat | null {
    return this.bids.length ? this.bids[this.bids.length - 1].who : null;
  }

  get done(): boolean {
    return this.reveal !== null;
  }

  get total(): number {
    return this.dice.you.length + this.dice.them.length;
  }

  bid(who: Seat, b: Bid): boolean {
    if (this.done || who !== this.toAct || !beats(b, this.last) || b.qty > this.total) return false;
    this.bids.push({ who, bid: { ...b } });
    this.events.push({ who, text: `${who === "you" ? "bid" : "bids"} ${bidText(b)}` });
    if (
      who === "you" &&
      this.rng.chance(Math.max(0.04, 0.1 + 0.22 * this.persona.face - 0.06 * this.playerFace))
    )
      // They catch something in your face: they know how many of that face you really have.
      this.readYou.set(b.face, countFace(this.dice.you, b.face));
    this.toAct = other(who);
    return true;
  }

  /** "Liar!" Lifts the cups and decides who loses a die. */
  call(who: Seat): DiceReveal | null {
    const last = this.last;
    const bidder = this.lastBidder;
    if (this.done || who !== this.toAct || !last || !bidder) return null;
    const count = countFace([...this.dice.you, ...this.dice.them], last.face);
    const loser = count >= last.qty ? who : bidder;
    this.events.push({ who, text: who === "you" ? 'call "Liar!"' : 'calls "Liar!"' });
    this.reveal = { bid: last, bidder, caller: who, count, loser };
    return this.reveal;
  }

  /** How likely they think a bid is to be good, from their dice and your bidding. */
  belief(b: Bid): number {
    const own = countFace(this.dice.them, b.face);
    const n = this.dice.you.length;
    const known = this.readYou.get(b.face);
    if (known !== undefined) return own + known >= b.qty ? 1 : 0;
    const yourBids = this.bids.filter((x) => x.who === "you" && x.bid.face === b.face).length;
    const trust = Math.max(0.1, Math.min(0.8, 0.55 - this.suspicion * 0.12));
    const extra = yourBids ? trust * Math.min(1.5, 0.8 + 0.35 * (yourBids - 1)) : 0;
    return atLeastSoft(n, Math.max(0, b.qty - own - extra));
  }

  /** The odds a bid is good from your side of the table (for Card Sense). */
  yourOdds(b: Bid): number {
    return atLeast(this.dice.them.length, b.qty - countFace(this.dice.you, b.face));
  }

  /** The high roller's move. */
  aiMove(): { kind: "bid"; bid: Bid } | { kind: "call" } {
    const p = this.persona;
    const last = this.last;
    type Option = { bid: Bid; p: number; own: number };
    const options: Option[] = [];
    for (let face = 2; face <= 6; face++) {
      const q0 = minQty(face, last);
      for (let q = q0; q <= Math.min(this.total, q0 + (last ? 1 : this.total)); q++) {
        const bid = { qty: q, face };
        options.push({ bid, p: this.belief(bid), own: countFace(this.dice.them, face) });
      }
    }
    const score = (o: Option) => o.p + 0.02 * o.own + o.bid.qty * 0.001;
    let choice: Option | undefined;
    if (!last) {
      // Opening: the biggest bid they're comfortable with, usually on their best face.
      const target = 0.62 - p.aggro * 0.12;
      const safe = options.filter((o) => o.p >= target);
      const bluffing = this.rng.chance(p.bluff * 0.35);
      const pool = safe.length ? safe : options;
      choice = pool.reduce((a, b) => {
        const ka = bluffing ? -a.own : a.own;
        const kb = bluffing ? -b.own : b.own;
        if (a.bid.qty !== b.bid.qty) return b.bid.qty > a.bid.qty ? b : a;
        return kb > ka ? b : a;
      });
      return { kind: "bid", bid: choice.bid };
    }
    const minimal = options.filter((o) => o.bid.qty === minQty(o.bid.face, last));
    const best = minimal.length ? minimal.reduce((a, b) => (score(b) > score(a) ? b : a)) : null;
    const pLast = this.belief(last);
    if (!best || pLast <= 0.02) return { kind: "call" };
    choice = best;
    if (this.rng.chance(p.bluff * 0.35)) {
      // A bluff: bid a face they hardly hold, if it isn't crazy.
      const fakes = minimal.filter((o) => o.p >= 0.35 && o.own < best.own);
      if (fakes.length) choice = this.rng.pick(fakes);
    }
    if (this.rng.chance(p.aggro * 0.4)) {
      const jump = options.find(
        (o) => o.bid.face === choice?.bid.face && o.bid.qty === (choice?.bid.qty ?? 0) + 1,
      );
      if (jump && jump.p >= 0.55) choice = jump;
    }
    if (pLast < 0.999) {
      const noise = this.rng.range(-0.06, 0.06);
      const doubt = 1 - pLast + (p.tight - 0.4) * 0.25 + noise;
      const nerve = best.p + (p.aggro - 0.5) * 0.12;
      if (doubt > nerve) return { kind: "call" };
    }
    return { kind: "bid", bid: choice.bid };
  }

  /** What their face gives away about their last bid, as your Poker Read sees it. */
  tell(read: number, knownTell: boolean, rng: Rng): TellKind {
    const mine = [...this.bids].reverse().find((b) => b.who === "them");
    const h = mine
      ? atLeast(this.dice.you.length, mine.bid.qty - countFace(this.dice.them, mine.bid.face))
      : 0.5;
    const truth: TellKind = h < 0.4 ? "weak" : h > 0.7 ? "strong" : "neutral";
    const accuracy = Math.max(
      0.2,
      Math.min(0.95, 0.5 + read * 0.15 + (knownTell ? 0.2 : 0) - this.persona.face * 0.3),
    );
    if (rng.chance(accuracy)) return truth;
    const kinds: TellKind[] = ["strong", "weak", "neutral"];
    return rng.pick(kinds.filter((k) => k !== truth));
  }
}

/**
 * A whole liar's dice duel. Both sides put up the stake; the last one with dice takes the pot.
 * Walking away early takes back a fifth of the stake for each die you still have.
 */
export class DiceMatch {
  counts: Record<Seat, number> = { you: DICE_EACH, them: DICE_EACH };
  opener: Seat;
  round: DiceRound | null = null;
  rounds = 0;
  /** Grows each time you're caught bluffing; they believe your bids less. */
  suspicion = 0;

  constructor(
    private rng: Rng,
    readonly stake: number,
    readonly persona: PokerPersona,
    private playerFace: number,
  ) {
    this.opener = rng.chance(0.5) ? "you" : "them";
  }

  newRound(loaded = false): DiceRound {
    this.round = new DiceRound(
      this.rng,
      this.counts,
      this.opener,
      this.persona,
      this.playerFace,
      this.suspicion,
      loaded,
    );
    return this.round;
  }

  /** Takes a die from the loser, who opens next. */
  finishRound(): void {
    const r = this.round;
    if (!r?.reveal) return;
    const { loser, bidder, bid } = r.reveal;
    this.counts[loser] = Math.max(0, this.counts[loser] - 1);
    this.opener = loser;
    this.rounds++;
    if (bidder === "you") {
      if (loser === "you" && countFace(r.dice.you, bid.face) === 0) this.suspicion++;
      else if (loser === "them") this.suspicion = Math.max(0, this.suspicion - 1);
    }
  }

  /** What you'd take with you if you got up now. */
  get yourStack(): number {
    const w = this.winner();
    if (w) return w === "you" ? this.stake * 2 : 0;
    return Math.round((this.counts.you * this.stake) / DICE_EACH);
  }

  winner(): Seat | null {
    if (this.counts.them <= 0) return "you";
    if (this.counts.you <= 0) return "them";
    return null;
  }
}
