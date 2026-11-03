import { describe, expect, it } from "vitest";
import { type BjRules, BlackjackRound, basicStrategy } from "../src/game/blackjack";
import { bjTotal, type Card, evalPoker, Shoe } from "../src/game/cards";
import { emptyBets, oddsPayout, resolveRoll } from "../src/game/craps";
import { madeStrength, PokerHand, PokerMatch, type Seat } from "../src/game/poker";
import { Rng } from "../src/game/rng";
import {
  betReturn,
  makeWheel,
  type RouletteBet,
  spinWheel,
  WHEEL_DOUBLE,
  WHEEL_SINGLE,
} from "../src/game/roulette";
import { centerLine, linePays, makeMachine, payback, spinReels } from "../src/game/slots";

const card = (s: string): Card => {
  const rank = { A: 14, K: 13, Q: 12, J: 11, T: 10 }[s[0]] ?? Number(s[0]);
  return { rank, suit: s[1] as Card["suit"] };
};
const hand = (s: string) => s.split(" ").map(card);

describe("poker hands", () => {
  it("ranks every category in order", () => {
    const order = [
      "2s 5h 9d Jc Kh",
      "2s 2h 9d Jc Kh",
      "2s 2h 9d 9c Kh",
      "2s 2h 2d 9c Kh",
      "As 2h 3d 4c 5h",
      "2h 5h 9h Jh Kh",
      "2s 2h 2d 9c 9h",
      "2s 2h 2d 2c 9h",
      "9s Ts Js Qs Ks",
    ];
    const scores = order.map((h) => evalPoker(hand(h)).score);
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    expect(evalPoker(hand("Ts Js Qs Ks As")).name).toBe("Royal Flush");
    expect(evalPoker(hand("As 2h 3d 4c 5h")).name).toBe("Straight, Five-high");
  });

  it("breaks ties with kickers", () => {
    expect(evalPoker(hand("Ks Kh 9d 8c 2h")).score).toBeGreaterThan(
      evalPoker(hand("Ks Kd 9h 7c 2s")).score,
    );
    expect(evalPoker(hand("Ks Kh 9d 8c 2h")).score).toBe(evalPoker(hand("Kc Kd 9h 8s 2c")).score);
  });
});

describe("blackjack", () => {
  const rules: BjRules = { decks: 6, h17: false, bjPays: 1.5, das: true };

  it("counts soft and hard totals", () => {
    expect(bjTotal(hand("As 6h"))).toEqual({ total: 17, soft: true });
    expect(bjTotal(hand("As 6h Kd"))).toEqual({ total: 17, soft: false });
    expect(bjTotal(hand("As Ah 9d"))).toEqual({ total: 21, soft: true });
  });

  it("follows the book on classic hands", () => {
    expect(basicStrategy(hand("8s 8h"), card("Th"), rules, true, true)).toBe("P");
    expect(basicStrategy(hand("6s 5h"), card("6h"), rules, true, false)).toBe("D");
    expect(basicStrategy(hand("Ts 6h"), card("Th"), rules, false, false)).toBe("H");
    expect(basicStrategy(hand("Ts 6h"), card("5h"), rules, false, false)).toBe("S");
    expect(basicStrategy(hand("Ts Th"), card("6h"), rules, true, true)).toBe("S");
  });

  it("keeps the money straight over many rounds of basic strategy", () => {
    const rng = new Rng(7);
    const shoe = new Shoe(6, rng);
    let net = 0;
    let wagered = 0;
    const N = 30000;
    for (let i = 0; i < N; i++) {
      if (shoe.needsShuffle()) shoe.shuffle();
      const r = new BlackjackRound(shoe, rules, 10);
      if (r.phase === "insurance") r.decideInsurance(false);
      while (r.phase === "play") {
        const h = r.hand;
        const m = basicStrategy(h.cards, r.upCard, rules, r.canDouble(), r.canSplit());
        if (m === "H") r.hit();
        else if (m === "S") r.stand();
        else if (m === "D") r.double();
        else r.split();
      }
      expect(r.payout).toBeGreaterThanOrEqual(0);
      expect(r.payout).toBe(r.staked + r.net);
      net += r.net;
      wagered += 10;
    }
    // The house edge with these rules is about half a percent.
    const edge = net / wagered;
    expect(edge).toBeGreaterThan(-0.04);
    expect(edge).toBeLessThan(0.03);
  });

  it("burns the busting card with a clover", () => {
    const rng = new Rng(3);
    for (let tries = 0; tries < 200; tries++) {
      const r = new BlackjackRound(new Shoe(6, rng), rules, 10);
      if (r.phase !== "play") continue;
      r.cloverArmed = true;
      while (r.phase === "play" && !r.burned) r.hit();
      if (r.burned) {
        expect(bjTotal(r.hand.cards).total).toBeLessThanOrEqual(21);
        expect(r.phase).toBe("play");
        return;
      }
    }
    throw new Error("never busted");
  });

  it("pays a natural 3:2 and 6:5", () => {
    for (const pays of [1.5, 1.2]) {
      const rng = new Rng(11);
      for (let i = 0; i < 2000; i++) {
        const r = new BlackjackRound(new Shoe(1, rng), { ...rules, bjPays: pays }, 10);
        if (r.phase === "insurance") r.decideInsurance(false);
        if (r.results[0]?.outcome === "blackjack") {
          expect(r.net).toBe(Math.floor(10 * pays));
          break;
        }
      }
    }
  });
});

describe("roulette", () => {
  it("pays the right odds", () => {
    const straight: RouletteBet = { kind: "straight", n: 17, amount: 10 };
    expect(betReturn(straight, 17)).toBe(360);
    expect(betReturn(straight, 18)).toBe(0);
    expect(betReturn({ kind: "red", n: 0, amount: 10 }, 0)).toBe(0);
    expect(betReturn({ kind: "red", n: 0, amount: 10 }, 32)).toBe(20);
    expect(betReturn({ kind: "dozen", n: 2, amount: 10 }, 13)).toBe(30);
    expect(betReturn({ kind: "column", n: 1, amount: 10 }, 34)).toBe(30);
    expect(betReturn({ kind: "even", n: 0, amount: 10 }, 37)).toBe(0);
  });

  it("has every pocket on the wheels", () => {
    expect(new Set(WHEEL_SINGLE).size).toBe(37);
    expect(new Set(WHEEL_DOUBLE).size).toBe(38);
  });

  it("makes worn wheels favor their pockets", () => {
    const rng = new Rng(5);
    const w = makeWheel(rng, false, 1);
    expect(w.bias).toHaveLength(5);
    let hits = 0;
    const N = 60000;
    for (let i = 0; i < N; i++) if (w.bias.includes(spinWheel(w, rng))) hits++;
    const fair = 5 / 37;
    expect(hits / N).toBeGreaterThan(fair * 1.05);
  });
});

describe("slots", () => {
  it("pays what the payback says", () => {
    const rng = new Rng(9);
    const m = makeMachine(rng, 0);
    let back = 0;
    const N = 200000;
    for (let i = 0; i < N; i++) back += linePays(centerLine(m, spinReels(m, rng)));
    expect(Math.abs(back / N - m.rtp)).toBeLessThan(0.04);
  });

  it("builds loose, fair and tight machines", () => {
    const rng = new Rng(2);
    for (let i = 0; i < 60; i++) {
      const m = makeMachine(rng, 0.2);
      if (m.looseness === "loose") expect(m.rtp).toBeGreaterThan(0.97);
      if (m.looseness === "tight") expect(m.rtp).toBeLessThan(0.87);
      expect(Math.abs(payback(40) - payback(41))).toBeLessThan(0.03);
    }
  });
});

describe("craps", () => {
  it("settles the line bets", () => {
    const bets = { ...emptyBets(), pass: 10, dontPass: 10, field: 5, anySeven: 5 };
    const r = resolveRoll([3, 4], null, bets);
    // Pass +10 (returns 20), don't pass lost, field lost, any seven 4:1 (returns 25).
    expect(r.returned).toBe(45);
    expect(r.point).toBeNull();
    const p = resolveRoll([2, 2], null, { ...emptyBets(), pass: 10 });
    expect(p.point).toBe(4);
    const made = resolveRoll([1, 3], 4, { ...p.bets, odds: 20 });
    expect(made.returned).toBe(20 + 20 + oddsPayout(4, 20));
    expect(oddsPayout(6, 10)).toBe(12);
    const out = resolveRoll([3, 4], 4, { ...p.bets, odds: 20 });
    expect(out.returned).toBe(0);
    expect(resolveRoll([6, 6], null, { ...emptyBets(), field: 10 }).returned).toBe(30);
    expect(resolveRoll([6, 6], null, { ...emptyBets(), dontPass: 10 }).returned).toBe(10);
  });
});

describe("poker", () => {
  const persona = { tight: 0.5, aggro: 0.5, bluff: 0.3, face: 0.5 };

  it("never loses or makes chips", () => {
    const rng = new Rng(21);
    for (let i = 0; i < 400; i++) {
      const stacks = { you: rng.int(5, 300), them: rng.int(5, 300) };
      const total = stacks.you + stacks.them;
      const h = new PokerHand(
        rng,
        stacks,
        i % 2 ? "you" : "them",
        { ante: 5, small: 10, big: 20 },
        persona,
        0,
        0,
      );
      let guard = 0;
      while (h.phase !== "done" && guard++ < 50) {
        if (h.phase === "draw") {
          h.draw(h.toAct, h.toAct === "them" ? h.aiDiscards() : [0, 1]);
          continue;
        }
        const opts = h.options();
        h.act(h.toAct === "them" ? h.aiAction() : rng.pick(opts));
      }
      expect(h.phase).toBe("done");
      expect(h.stacks.you + h.stacks.them).toBe(total);
      expect(h.stacks.you).toBeGreaterThanOrEqual(0);
      expect(h.stacks.them).toBeGreaterThanOrEqual(0);
    }
  });

  it("plays a whole match to the end", () => {
    const rng = new Rng(77);
    const m = new PokerMatch(rng, 400, persona, 0);
    let hands = 0;
    while (!m.winner() && hands++ < 2000) {
      const h = m.newHand();
      while (h.phase !== "done") {
        if (h.phase === "draw") {
          if (h.toAct === "them") h.draw("them", h.aiDiscards());
          else h.draw("you", []);
          continue;
        }
        if (h.toAct === "them") h.act(h.aiAction());
        else {
          // A simple player: bet good hands, call fair ones, fold junk.
          const s = madeStrength(h.cards.you);
          const opts = h.options();
          const pick = (a: Parameters<typeof h.act>[0]) => opts.includes(a);
          if (s > 0.6 && (pick("raise") || pick("bet"))) h.act(pick("raise") ? "raise" : "bet");
          else if (pick("check")) h.act("check");
          else if (s > 0.3) h.act("call");
          else h.act("fold");
        }
      }
      m.finishHand();
    }
    expect(m.winner()).not.toBeNull();
    expect(m.stacks.you + m.stacks.them).toBe(800);
  });

  it("deals the AI sensible draws", () => {
    const rng = new Rng(1);
    for (let i = 0; i < 300; i++) {
      const h = new PokerHand(
        rng,
        { you: 100, them: 100 },
        "you",
        { ante: 1, small: 2, big: 4 },
        persona,
        0,
        0,
      );
      const d = h.aiDiscards();
      expect(d.length).toBeLessThanOrEqual(4);
      const v = evalPoker(h.cards.them);
      if (v.cat >= 4) expect(d).toEqual([]);
      for (const k of v.cat >= 1 && v.cat < 4 ? v.used : []) expect(d).not.toContain(k);
    }
  });

  it("gives tells that mostly match the hand for a sharp reader", () => {
    const rng = new Rng(4);
    let right = 0;
    let total = 0;
    for (let i = 0; i < 2000; i++) {
      const h = new PokerHand(
        rng,
        { you: 100, them: 100 },
        "them" as Seat,
        { ante: 1, small: 2, big: 4 },
        { ...persona, face: 0.2 },
        0,
        0,
      );
      const s = h.rawStrength();
      if (s > 0.36 && s < 0.62) continue;
      total++;
      const kind = h.tell(3, false, rng);
      if ((s >= 0.62 && kind === "strong") || (s <= 0.36 && kind === "weak")) right++;
    }
    expect(right / total).toBeGreaterThan(0.75);
  });
});
