import { describe, expect, it } from "vitest";
import { type Card, Shoe } from "../src/game/cards";
import { CASINOS } from "../src/game/data/casinos";
import { REGULARS, TOURNEY_FEE } from "../src/game/data/tourney";
import { Game, SAVE_VERSION } from "../src/game/game";
import { Rng } from "../src/game/rng";
import { Tournament } from "../src/game/tournament";

const you = { ...REGULARS[0], id: "you", name: "You", short: "You" };
const make = (seed = 1) => {
  const rng = new Rng(seed);
  return new Tournament(rng, new Shoe(6, rng), REGULARS.slice(1, 5), you);
};

/** Plays a whole tournament with everyone (you too) betting and playing like the computer. */
function playThrough(t: Tournament): void {
  for (let guard = 0; guard < 5000 && t.phase !== "over"; guard++) {
    if (t.phase === "bet") t.bet(t.you.out ? 0 : t.aiBet(t.you));
    else if (t.phase === "play") t.act(t.aiMove());
    else t.nextHand();
  }
}

describe("blackjack tournaments", () => {
  it("seats you in the middle of five", () => {
    const t = make();
    expect(t.seats.length).toBe(5);
    expect(t.seats[2].you).toBe(true);
    expect(t.seats.every((s) => s.chips === 1000)).toBe(true);
  });

  it("checks your bet", () => {
    const t = make();
    expect(t.bet(5)).not.toBeNull();
    expect(t.bet(600)).not.toBeNull();
    expect(t.phase).toBe("bet");
    expect(t.bet(100)).toBeNull();
    expect(t.phase === "play" || t.phase === "done").toBe(true);
  });

  it("always finishes, with no chips made from thin air", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const t = make(seed);
      playThrough(t);
      expect(t.phase).toBe("over");
      expect(t.hand).toBeLessThanOrEqual(10);
      for (const s of t.seats) expect(s.chips).toBeGreaterThanOrEqual(0);
      // Prizes add up to the two places' worth, however the ties fall.
      const total = t.seats.reduce((sum, s) => sum + t.prize(s, 1000), 0);
      expect(Math.abs(total - 5000)).toBeLessThanOrEqual(5);
    }
  });

  it("splits the prizes between tied players", () => {
    const t = make();
    const [a, b, c, d, e] = t.seats;
    a.chips = 1500;
    b.chips = 1500;
    c.chips = 900;
    d.chips = 800;
    e.chips = 0;
    expect(t.place(a)).toBe(1);
    expect(t.place(b)).toBe(1);
    expect(t.place(c)).toBe(3);
    expect(t.prize(a, 100)).toBe(250);
    expect(t.prize(c, 100)).toBe(0);
  });

  it("chases the leader at the end and protects a big lead", () => {
    const t = make();
    t.hand = 9;
    const [a, b] = t.seats;
    t.you.chips = 1400;
    a.chips = 1000;
    expect(t.aiBet(a)).toBeGreaterThanOrEqual(410);
    b.chips = 3000;
    expect(t.aiBet(b)).toBe(10);
  });

  it("ends the hand at once on a dealer blackjack", () => {
    const rng = new Rng(3);
    const shoe = new Shoe(6, rng);
    const c = (rank: number): Card => ({ rank, suit: "s" });
    // Cards come off the end: five players' first cards, the dealer's ace, then the second
    // round, then the dealer's king.
    shoe.needsShuffle = () => false;
    shoe.cards = [c(13), c(5), c(5), c(5), c(5), c(5), c(14), c(9), c(9), c(9), c(9), c(9)];
    const t = new Tournament(rng, shoe, REGULARS.slice(1, 5), you);
    t.bet(100);
    expect(t.phase).toBe("done");
    expect(t.seats.every((s) => s.result === "lose")).toBe(true);
    expect(t.you.chips).toBe(900);
  });
});

describe("tournament night", () => {
  const ready = () => {
    const g = Game.create("Champ", "normal", 21);
    g.enterArea("rustyspur");
    g.s.cash = 1000;
    return g;
  };

  it("has a tournament table on every floor", () => {
    const g = ready();
    expect(g.area.tables.some((t) => t.kind === "tourney")).toBe(true);
  });

  it("fills the field with the casino's own people", () => {
    const g = ready();
    const field = g.tourneyField();
    expect(field.length).toBe(4);
    const ids = CASINOS.rustyspur.rollers.map((r) => r.id);
    expect(field.some((e) => ids.includes(e.id))).toBe(true);
    expect(new Set(field.map((e) => e.id)).size).toBe(4);
    // The same field all night.
    expect(g.tourneyField().map((e) => e.id)).toEqual(field.map((e) => e.id));
  });

  it("takes the fee, runs once a night, and opens again after the motel", () => {
    const g = ready();
    const t = g.startTourney();
    if (typeof t === "string") throw new Error(t);
    expect(g.s.cash).toBe(1000 - TOURNEY_FEE[0]);
    expect(typeof g.startTourney()).toBe("string");
    g.enterArea("strip", "rustyspur");
    g.sleep();
    g.enterArea("rustyspur");
    expect(g.tourneyClosed()).toBeNull();
  });

  it("pays the winner and hands over a trophy", () => {
    const g = ready();
    const t = g.startTourney();
    if (typeof t === "string") throw new Error(t);
    playThrough(t);
    for (const s of t.seats) s.chips = s.you ? 5000 : 100;
    const cash = g.s.cash;
    const r = g.endTourney(t);
    expect(r.place).toBe(1);
    expect(r.trophy).toBe(true);
    expect(g.s.cash).toBe(cash + TOURNEY_FEE[0] * 3.5);
    expect(g.s.trophies).toContain("rustyspur");
    expect(g.s.tourneyStats.won).toBe(1);
  });

  it("keeps Dutch off the riverboat's tournament", () => {
    const g = Game.create("Deck", "normal", 8);
    g.s.chips.push("rustyspur", "coralgrotto");
    g.enterArea("belle");
    for (let i = 0; i < 30; i++) {
      g.s.turn += 1440;
      expect(g.tourneyField().some((e) => e.id === "dutch")).toBe(false);
    }
  });

  it("loads a 0.3 save", () => {
    const g = Game.create("Old", "normal", 3);
    const old = JSON.parse(g.save());
    old.version = 3;
    delete old.tourneys;
    delete old.trophies;
    delete old.tourneyStats;
    const back = Game.load(JSON.stringify(old));
    expect(back.s.version).toBe(SAVE_VERSION);
    expect(back.s.trophies).toEqual([]);
    expect(back.s.tourneyStats.played).toBe(0);
  });
});
