import { describe, expect, it } from "vitest";
import { bacReturn, bacTotal, bankerDraws, dealCoup } from "../src/game/baccarat";
import { type Card, Shoe } from "../src/game/cards";
import { CASINO_ORDER, CASINOS, RIVAL } from "../src/game/data/casinos";
import { Game, niceRound, SAVE_VERSION } from "../src/game/game";
import { Rng } from "../src/game/rng";
import { VideoPokerHand, VP_TABLES, vpHint, vpPays, vpRank } from "../src/game/videopoker";
import { buildCasino, reachable } from "../src/game/world";

const card = (s: string): Card => {
  const rank = { A: 14, K: 13, Q: 12, J: 11, T: 10 }[s[0]] ?? Number(s[0]);
  return { rank, suit: s[1] as Card["suit"] };
};
const hand = (s: string) => s.split(" ").map(card);

describe("video poker", () => {
  it("names the pay lines", () => {
    expect(vpRank(hand("Ts Js Qs Ks As"))).toBe(0);
    expect(vpRank(hand("9s Ts Js Qs Ks"))).toBe(1);
    expect(vpRank(hand("Js Jh 2d 5c 9h"))).toBe(8);
    expect(vpRank(hand("Ts Th 2d 5c 9h"))).toBe(-1);
    expect(vpPays(VP_TABLES["9/6"], hand("2s 2h 2d 9c 9h"), 5)).toBe(45);
    expect(vpPays(VP_TABLES["6/5"], hand("2s 2h 2d 9c 9h"), 5)).toBe(30);
    expect(vpPays(VP_TABLES["9/6"], hand("Ts Js Qs Ks As"), 5)).toBe(4000);
    expect(vpPays(VP_TABLES["9/6"], hand("Ts Js Qs Ks As"), 4)).toBe(1000);
  });

  it("holds the obvious cards", () => {
    expect(vpHint(hand("Js Jh 2d 5c 9h")).sort()).toEqual([0, 1]);
    expect(vpHint(hand("Ts Js Qs Ks 2h")).sort()).toEqual([0, 1, 2, 3]);
    expect(vpHint(hand("2s 3h 7d 8c 9h"))).toEqual([]);
    expect(vpHint(hand("2h 5h 9h Kh 3s")).sort()).toEqual([0, 1, 2, 3]);
  });

  it("pays back close to the table's figure when played by the book", () => {
    const rng = new Rng(31);
    const table = VP_TABLES["9/6"];
    let back = 0;
    const N = 120000;
    for (let i = 0; i < N; i++) {
      const h = new VideoPokerHand(rng);
      const keep = vpHint(h.cards);
      h.held = [0, 1, 2, 3, 4].map((k) => keep.includes(k));
      h.draw();
      back += vpPays(table, h.cards, 5) / 5;
    }
    const rtp = back / N;
    expect(rtp).toBeGreaterThan(0.94);
    expect(rtp).toBeLessThan(1.04);
  });
});

describe("baccarat", () => {
  it("counts like baccarat", () => {
    expect(bacTotal(hand("Ks 9h"))).toBe(9);
    expect(bacTotal(hand("7s 8h"))).toBe(5);
    expect(bacTotal(hand("As Th"))).toBe(1);
  });

  it("follows the banker's drawing rules", () => {
    expect(bankerDraws(5, null)).toBe(true);
    expect(bankerDraws(6, null)).toBe(false);
    expect(bankerDraws(3, card("8s"))).toBe(false);
    expect(bankerDraws(6, card("7s"))).toBe(true);
    expect(bankerDraws(6, card("5s"))).toBe(false);
  });

  it("pays and keeps the usual house edges", () => {
    expect(bacReturn("banker", 100, "banker")).toBe(195);
    expect(bacReturn("player", 100, "tie")).toBe(100);
    expect(bacReturn("tie", 100, "tie")).toBe(900);
    const rng = new Rng(12);
    const shoe = new Shoe(8, rng);
    const net = { player: 0, banker: 0 };
    const N = 80000;
    for (let i = 0; i < N; i++) {
      if (shoe.needsShuffle()) shoe.shuffle();
      const c = dealCoup(shoe);
      expect(c.player.length).toBeLessThanOrEqual(3);
      net.player += bacReturn("player", 100, c.winner) - 100;
      net.banker += bacReturn("banker", 100, c.winner) - 100;
    }
    expect(net.player / (N * 100)).toBeGreaterThan(-0.03);
    expect(net.player / (N * 100)).toBeLessThan(0.005);
    expect(net.banker / (N * 100)).toBeGreaterThan(-0.03);
    expect(net.banker / (N * 100)).toBeLessThan(0.005);
  });
});

describe("0.2 floors and rules", () => {
  it("puts reachable video poker and baccarat on every floor", () => {
    for (let seed = 1; seed <= 25; seed++)
      for (const id of CASINO_ORDER) {
        const c = CASINOS[id];
        const a = buildCasino(c, seed * 104729);
        const reach = reachable(a);
        expect(a.videos.length).toBe(4);
        for (const v of a.videos) {
          const ok = [-1, 0, 1].some((dy) =>
            [-1, 0, 1].some((dx) => reach.has((v.y + dy) * a.w + v.x + dx)),
          );
          expect(ok, `${id} ${v.id}`).toBe(true);
        }
        expect(a.tables.some((t) => t.kind === "baccarat")).toBe(!!c.baccarat);
      }
  });

  it("upgrades 0.1 saves", () => {
    const g = Game.create("Old", "normal", 3);
    const old = JSON.parse(g.save());
    old.version = 1;
    delete old.comps;
    delete old.rival;
    const back = Game.load(JSON.stringify(old));
    expect(back.s.comps).toBe(0);
    expect(back.s.rival.wins).toBe(0);
    expect(back.s.version).toBe(SAVE_VERSION);
  });

  it("earns and spends comp points", () => {
    const g = Game.create("Club", "normal", 3);
    g.enterArea("rustyspur");
    g.houseResult({ table: { x: 10, y: 10 }, bet: 100, net: 0, min: 5 });
    expect(g.s.comps).toBe(20);
    expect(g.redeem("cash")).not.toBeNull();
    g.s.comps = 60;
    const cash = g.s.cash;
    expect(g.redeem("cash")).toBeNull();
    expect(g.s.cash).toBe(cash + 15);
    g.s.comps = 200;
    g.s.heat.rustyspur = 80;
    expect(g.redeem("suite")).toBeNull();
    expect(g.heatIn("rustyspur")).toBe(0);
  });

  it("gives Dutch's coin after three wins", () => {
    const g = Game.create("Rival", "normal", 3);
    g.enterArea("rustyspur");
    g.s.cash = 4000;
    for (let i = 0; i < 3; i++) {
      const r = g.rivalDef();
      expect(r.stake).toBe(niceRound(g.s.cash * 0.25));
      expect(g.startDuel(r)).toBeNull();
      g.endDuel("won", r.stake * 2);
    }
    expect(g.s.rival.wins).toBe(3);
    expect(g.s.pockets).toContain("dutchcoin");
    expect(g.s.beaten).not.toContain(RIVAL.id);
    expect(g.skill("face")).toBe(1);
  });

  it("lets the millionaire cut and the pickpocket get caught", () => {
    const g = Game.create("Floor", "normal", 3);
    g.enterArea("rustyspur");
    const m = {
      id: "m",
      kind: "millionaire" as const,
      x: 0,
      y: 0,
      glyph: "",
      color: "",
      name: "",
      wander: false,
    };
    const before = g.s.cash;
    const r = g.cutDeck(m);
    if (typeof r === "string") throw new Error(r);
    expect(g.s.cash).toBe(before + (r.won ? 50 : -50));
    expect(m.kind).toBe("patron");
    const pp = {
      id: "p",
      kind: "pickpocket" as const,
      x: 0,
      y: 0,
      glyph: "",
      color: "",
      name: "",
      wander: false,
    };
    g.area.npcs.push(pp);
    const cash = g.s.cash;
    g.catchPickpocket(pp);
    expect(g.s.cash).toBe(cash + 25);
    expect(g.area.npcs).not.toContain(pp);
  });

  it("rounds stakes nicely", () => {
    expect(niceRound(1234)).toBe(1200);
    expect(niceRound(87)).toBe(87);
    expect(niceRound(55555)).toBe(56000);
  });
});
