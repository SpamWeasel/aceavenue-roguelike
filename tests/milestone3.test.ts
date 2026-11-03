import { describe, expect, it } from "vitest";
import { CHUCK_SPOTS, chuckReturn } from "../src/game/chuckaluck";
import { CASINOS, ROLLER_BY_ID } from "../src/game/data/casinos";
import { Game } from "../src/game/game";
import {
  atLeast,
  beats,
  bidText,
  countFace,
  DiceMatch,
  DiceRound,
  minQty,
} from "../src/game/liarsdice";
import { Rng } from "../src/game/rng";
import { buildStrip, reachable, stripDoor } from "../src/game/world";

const persona = { tight: 0.4, aggro: 0.5, bluff: 0.3, face: 0.5 };

describe("liar's dice", () => {
  it("knows which bids beat which", () => {
    expect(beats({ qty: 3, face: 4 }, { qty: 3, face: 3 })).toBe(true);
    expect(beats({ qty: 4, face: 2 }, { qty: 3, face: 6 })).toBe(true);
    expect(beats({ qty: 3, face: 3 }, { qty: 3, face: 3 })).toBe(false);
    expect(beats({ qty: 2, face: 6 }, { qty: 3, face: 2 })).toBe(false);
    expect(beats({ qty: 1, face: 1 }, null)).toBe(false);
    expect(minQty(5, { qty: 3, face: 4 })).toBe(3);
    expect(minQty(2, { qty: 3, face: 4 })).toBe(4);
    expect(bidText({ qty: 1, face: 6 })).toBe("1 six");
    expect(bidText({ qty: 4, face: 5 })).toBe("4 fives");
  });

  it("counts ones as wild and works out the odds", () => {
    expect(countFace([1, 5, 5, 2, 3], 5)).toBe(3);
    expect(countFace([1, 1, 6, 2, 3], 4)).toBe(2);
    expect(atLeast(5, 0)).toBe(1);
    expect(atLeast(2, 3)).toBe(0);
    expect(atLeast(3, 1)).toBeCloseTo(1 - (2 / 3) ** 3, 10);
    expect(atLeast(5, 5)).toBeCloseTo((1 / 3) ** 5, 10);
  });

  it("takes a die from whoever is wrong", () => {
    const rng = new Rng(5);
    const r = new DiceRound(rng, { you: 5, them: 5 }, "you", persona, 0, 0);
    r.dice = { you: [1, 4, 4, 2, 6], them: [4, 3, 3, 5, 5] };
    expect(r.bid("you", { qty: 4, face: 4 })).toBe(true);
    expect(r.bid("you", { qty: 5, face: 4 })).toBe(false); // not your turn
    expect(r.bid("them", { qty: 3, face: 4 })).toBe(false); // too low
    const rv = r.call("them");
    expect(rv?.count).toBe(4);
    expect(rv?.loser).toBe("them");

    const r2 = new DiceRound(rng, { you: 5, them: 5 }, "them", persona, 0, 0);
    r2.dice = { you: [2, 2, 3, 3, 6], them: [5, 5, 5, 2, 3] };
    r2.bid("them", { qty: 5, face: 5 });
    expect(r2.call("you")?.loser).toBe("them");
  });

  it("never makes an illegal move, and a match always ends", () => {
    const rng = new Rng(77);
    for (let i = 0; i < 300; i++) {
      const m = new DiceMatch(rng, 1000, persona, i % 4);
      let guard = 0;
      while (!m.winner()) {
        const r = m.newRound();
        while (!r.done) {
          // The high roller on both sides: from your seat, a mirror of their move.
          const mv = r.aiMove();
          if (mv.kind === "call") {
            if (!r.last) throw new Error("called with no bid");
            r.call(r.toAct);
          } else expect(r.bid(r.toAct, mv.bid)).toBe(true);
          expect(++guard).toBeLessThan(2000);
        }
        m.finishRound();
      }
      const w = m.winner();
      expect(m.counts[w === "you" ? "them" : "you"]).toBe(0);
      expect(m.yourStack).toBe(w === "you" ? 2000 : 0);
    }
  });

  it("lets you walk away with your dice's worth", () => {
    const m = new DiceMatch(new Rng(3), 3000, persona, 0);
    expect(m.yourStack).toBe(3000);
    m.counts.you = 2;
    expect(m.yourStack).toBe(1200);
  });
});

describe("chuck-a-luck", () => {
  it("pays like the birdcage", () => {
    expect(chuckReturn(4, 10, [4, 2, 6])).toBe(20);
    expect(chuckReturn(4, 10, [4, 4, 6])).toBe(30);
    expect(chuckReturn(4, 10, [4, 4, 4])).toBe(110);
    expect(chuckReturn(4, 10, [1, 2, 3])).toBe(0);
    expect(chuckReturn("high", 10, [6, 5, 1])).toBe(20);
    expect(chuckReturn("high", 10, [6, 6, 6])).toBe(0);
    expect(chuckReturn("low", 10, [1, 1, 1])).toBe(0);
    expect(chuckReturn("triple", 10, [2, 2, 2])).toBe(310);
  });

  it("keeps a house edge on every bet", () => {
    for (const spot of CHUCK_SPOTS) {
      let back = 0;
      for (let a = 1; a <= 6; a++)
        for (let b = 1; b <= 6; b++)
          for (let c = 1; c <= 6; c++) back += chuckReturn(spot, 1, [a, b, c]);
      const edge = 1 - back / 216;
      expect(edge, String(spot)).toBeGreaterThan(0.02);
      expect(edge, String(spot)).toBeLessThan(0.15);
    }
  });
});

describe("the Magnolia Belle", () => {
  it("ties up at a pier you can reach", () => {
    const strip = buildStrip();
    const d = stripDoor(strip, "belle");
    const reach = reachable(strip);
    expect(reach.has(d.outY * strip.w + d.outX)).toBe(true);
  });

  it("needs the Coral Grotto's chip to board", () => {
    const g = Game.create("Deck", "normal", 8);
    expect(g.canEnter("belle").ok).toBe(false);
    g.s.chips.push("rustyspur", "coralgrotto");
    expect(g.canEnter("belle").ok).toBe(true);
  });

  it("has chuck-a-luck and dice players", () => {
    const g = Game.create("Deck", "normal", 8);
    g.s.chips.push("rustyspur", "coralgrotto");
    g.enterArea("belle");
    expect(g.area.tables.filter((t) => t.kind === "chuck").length).toBe(2);
    expect(CASINOS.belle.rollers.filter((r) => r.game === "dice").length).toBe(2);
    expect(CASINOS.belle.boss.game).toBe("dice");
  });

  it("never has Dutch aboard", () => {
    const g = Game.create("Deck", "normal", 8);
    g.s.chips.push("rustyspur", "coralgrotto");
    g.s.cash = 5000;
    for (let i = 0; i < 40; i++) {
      g.s.rival.last = -1000;
      g.enterArea("belle");
      expect(g.area.npcs.some((n) => n.kind === "rival")).toBe(false);
    }
  });

  it("gives the Captain's secret instead of a golden chip", () => {
    const g = Game.create("Deck", "normal", 8);
    g.s.chips.push("rustyspur", "coralgrotto");
    g.enterArea("belle");
    g.s.cash = 20000;
    const tier = g.tier;
    const cap = ROLLER_BY_ID.thibodeaux;
    expect(g.startDuel(cap)).toBeNull();
    g.endDuel("won", cap.stake * 2);
    expect(g.s.chips).not.toContain("belle");
    expect(g.tier).toBe(tier);
    expect(g.knowsTell("baron")).toBe(true);
    expect(g.s.pockets).toContain("spyglass");
    expect(g.s.over).toBeNull();
  });
});

describe("the Insurance Policy", () => {
  it("pays back half the stake once", () => {
    const g = Game.create("Policy", "normal", 8);
    g.enterArea("rustyspur");
    g.s.cash = 1000;
    g.s.pockets.push("policy");
    const r = ROLLER_BY_ID.jo;
    g.startDuel(r);
    g.endDuel("lost", 0);
    expect(g.s.cash).toBe(1000 - r.stake + r.stake / 2);
    expect(g.has("policy")).toBe(false);
  });

  it("doesn't cover cheats", () => {
    const g = Game.create("Policy", "normal", 8);
    g.enterArea("rustyspur");
    g.s.cash = 1000;
    g.s.pockets.push("policy");
    const r = ROLLER_BY_ID.jo;
    g.startDuel(r);
    g.endDuel("lost", 0, "Caught!");
    expect(g.s.cash).toBe(1000 - r.stake);
    expect(g.has("policy")).toBe(true);
  });
});

describe("0.3 saves", () => {
  it("load a 0.2 save", () => {
    const g = Game.create("Old", "normal", 3);
    const old = JSON.parse(g.save());
    old.version = 2;
    const back = Game.load(JSON.stringify(old));
    expect(back.s.version).toBe(3);
  });
});
