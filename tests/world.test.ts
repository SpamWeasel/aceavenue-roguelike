import { describe, expect, it } from "vitest";
import { ALL_CASINOS, CASINO_ORDER, CASINOS, ROLLER_BY_ID } from "../src/game/data/casinos";
import { Game } from "../src/game/game";
import { Rng } from "../src/game/rng";
import { buildCasino, buildStrip, reachable, T, tileAt, walkable } from "../src/game/world";

const DIRS = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => [dx, dy] as const));

/** Can you stand next to this square? */
function touchable(reach: Set<number>, w: number, x: number, y: number): boolean {
  return DIRS.some(([dx, dy]) => reach.has((y + dy) * w + x + dx));
}

describe("the Avenue", () => {
  it("lets you reach every door", () => {
    const a = buildStrip();
    const reach = reachable(a);
    for (const d of a.doors) {
      expect(touchable(reach, a.w, d.x, d.y)).toBe(true);
      expect(walkable(tileAt(a, d.outX, d.outY))).toBe(true);
    }
    expect(a.doors.map((d) => d.target)).toEqual(
      expect.arrayContaining([...CASINO_ORDER, "academy", "charms", "pawn", "motel", "loans"]),
    );
  });
});

describe("casino floors", () => {
  it("are fully reachable for many seeds", () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const id of ALL_CASINOS) {
        const c = CASINOS[id];
        const a = buildCasino(c, seed * 7919);
        const reach = reachable(a);
        for (const t of a.tables) {
          let ok = false;
          for (let y = t.y; y < t.y + t.h; y++)
            for (let x = t.x; x < t.x + t.w; x++) if (touchable(reach, a.w, x, y)) ok = true;
          expect(ok, `${id} seed ${seed} table ${t.id}`).toBe(true);
        }
        for (const m of a.machines)
          expect(touchable(reach, a.w, m.x, m.y), `${id} machine ${m.id}`).toBe(true);
        const vip = a.vipDoor as { x: number; y: number };
        expect(touchable(reach, a.w, vip.x, vip.y)).toBe(true);
        expect([...reach].some((i) => tileAt(a, i % a.w, Math.floor(i / a.w)) === T.exit)).toBe(
          true,
        );
        // Every high roller and the boss has a table and is standing on the map.
        for (const r of [...c.rollers, c.boss]) {
          expect(a.tables.some((t) => t.rollerId === r.id)).toBe(true);
          const npc = a.npcs.find((n) => n.rollerId === r.id);
          expect(npc).toBeDefined();
          if (npc && !r.boss) expect(touchable(reach, a.w, npc.x, npc.y)).toBe(true);
        }
        expect(a.tables.filter((t) => t.kind === "blackjack").length).toBeGreaterThanOrEqual(3);
        expect(a.machines.length).toBeGreaterThanOrEqual(12);
        if (c.roulette) expect(a.tables.some((t) => t.kind === "roulette")).toBe(true);
        if (c.craps) expect(a.tables.some((t) => t.kind === "craps")).toBe(true);
      }
    }
  });

  it("are the same for the same seed", () => {
    const a = buildCasino(CASINOS.starlight, 42);
    const b = buildCasino(CASINOS.starlight, 42);
    expect(a.tiles).toEqual(b.tiles);
    expect(a.machines.map((m) => m.def.rtp)).toEqual(b.machines.map((m) => m.def.rtp));
  });
});

describe("the game", () => {
  it("saves and loads", () => {
    const g = Game.create("Tester", "normal", 99);
    g.enterArea("rustyspur");
    g.s.cash = 777;
    const back = Game.load(g.save());
    expect(back.s.cash).toBe(777);
    expect(back.area.id).toBe("rustyspur");
  });

  it("gives back the stack of a duel interrupted by closing the game", () => {
    const g = Game.create("Tester", "normal", 5);
    g.enterArea("rustyspur");
    expect(g.startDuel(ROLLER_BY_ID.pete)).toBeNull();
    g.duelStack(150);
    const back = Game.load(g.save());
    expect(back.s.duel).toBeNull();
    expect(back.s.cash).toBe(500 - 200 + 150);
  });

  it("opens the next casino with a golden chip", () => {
    const g = Game.create("Tester", "normal", 5);
    expect(g.canEnter("coralgrotto").ok).toBe(false);
    g.s.cash = 5000;
    g.enterArea("rustyspur");
    for (const r of [...CASINOS.rustyspur.rollers, CASINOS.rustyspur.boss]) {
      expect(g.startDuel(r)).toBeNull();
      g.endDuel("won", r.stake * 2);
    }
    expect(g.s.chips).toContain("rustyspur");
    expect(g.canEnter("coralgrotto").ok).toBe(true);
    expect(g.s.pockets).toEqual(expect.arrayContaining(["horseshoe", "glasses", "flask"]));
  });

  it("walks you out at full heat and lets you back after a night's sleep", () => {
    const g = Game.create("Tester", "normal", 5);
    g.enterArea("rustyspur");
    let out = false;
    for (let i = 0; i < 100 && !out; i++) out = g.addHeat(10);
    expect(out).toBe(true);
    expect(g.area.id).toBe("strip");
    expect(g.canEnter("rustyspur").ok).toBe(false);
    expect(g.sleep()).toBeNull();
    expect(g.canEnter("rustyspur").ok).toBe(true);
  });

  it("ends the run when you're broke with no way out", () => {
    const g = Game.create("Tester", "normal", 5);
    g.s.cash = 0;
    g.checkBroke();
    expect(g.s.over).toBeNull();
    expect(g.borrow()).toBeNull();
    g.s.cash = 0;
    g.checkBroke();
    expect(g.s.over).toBe("broke");
  });

  it("survives a long random walk through every casino", () => {
    const g = Game.create("Walker", "normal", 1234);
    g.s.chips = ["rustyspur", "coralgrotto", "starlight", "velvetfox"];
    const rng = new Rng(8);
    for (const id of CASINO_ORDER) {
      g.enterArea(id);
      for (let i = 0; i < 600; i++) {
        const it = g.move(rng.int(-1, 1), rng.int(-1, 1));
        if (it?.kind === "talk" && it.npc.tip) g.buyTip(it.npc);
        if (g.area.id === "strip") g.enterArea(id);
      }
      expect(g.area.npcs.length).toBeGreaterThan(5);
    }
    const back = Game.load(g.save());
    expect(back.s.turn).toBe(g.s.turn);
  });
});
