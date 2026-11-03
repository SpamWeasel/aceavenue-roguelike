import { type Card, cardName, newDeck, Shoe } from "./cards";
import { C } from "./colors";
import {
  CASINO_ORDER,
  CASINOS,
  type CasinoDef,
  type CasinoId,
  RIVAL,
  ROLLER_BY_ID,
  ROLLER_CASINO,
  type RollerDef,
} from "./data/casinos";
import {
  DRINK_TURNS,
  DRINKS,
  type DrinkId,
  ITEMS,
  type ItemId,
  SKILL_ORDER,
  SKILLS,
  type SkillId,
} from "./data/items";
import {
  CHARM_STOCK,
  CLUB_REWARDS,
  type ClubRewardId,
  COMP_UNIT,
  LOAN_INTEREST,
  LOAN_SIZE,
  LOAN_TERM,
  MOTEL_PRICE,
  PATRON_LINES,
  PAWN_BUYS,
  PAWN_SELLS,
  PAWN_STOCK,
  PIT_BOSS_LINES,
  SECURITY_LINES,
  SHOPS,
  type ShopId,
  STREET_LINES,
} from "./data/shops";
import type { PokerPersona } from "./poker";
import { hashSeed, Rng } from "./rng";
import {
  type Area,
  buildCasino,
  buildStrip,
  type MachineSpot,
  type Npc,
  openSquares,
  stripDoor,
  T,
  type TableDef,
  type Tip,
  tileAt,
  type VideoSpot,
  walkable,
} from "./world";

export const SAVE_VERSION = 3;
export const POCKET_SIZE = 8;

export type Difficulty = "easy" | "normal" | "hard";
export const DIFFICULTY: Record<
  Difficulty,
  { label: string; cash: number; heat: number; face: number; text: string }
> = {
  easy: {
    label: "Easy",
    cash: 1000,
    heat: 0.7,
    face: -0.1,
    text: "Start with $1,000. Security is relaxed and tells are easier to read.",
  },
  normal: { label: "Normal", cash: 500, heat: 1, face: 0, text: "Start with $500." },
  hard: {
    label: "Hard",
    cash: 300,
    heat: 1.3,
    face: 0.1,
    text: "Start with $300. Security is twitchy and the high rollers hide their tells.",
  },
};

export type SoundId =
  | "card"
  | "chip"
  | "win"
  | "bigwin"
  | "lose"
  | "tick"
  | "dice"
  | "jackpot"
  | "deny"
  | "door"
  | "buy"
  | "coin"
  | "alarm"
  | "shuffle"
  | "levelup";

export interface LogLine {
  text: string;
  color: string;
}

export interface State {
  version: number;
  seed: number;
  name: string;
  difficulty: Difficulty;
  turn: number;
  /** Minutes added to the clock by sleeping. */
  clockShift: number;
  area: string;
  x: number;
  y: number;
  cash: number;
  debt: number;
  debtDue: number;
  skills: Record<SkillId, number>;
  pockets: ItemId[];
  buffs: { id: DrinkId; until: number }[];
  heat: Partial<Record<CasinoId, number>>;
  banned: Partial<Record<CasinoId, boolean>>;
  beaten: string[];
  chips: CasinoId[];
  knownTells: string[];
  visits: Record<string, number>;
  /** A duel in progress: the money you have on that table. */
  duel: { rollerId: string; stack: number; stake?: number } | null;
  /** Players' Club points from house play (0.2). */
  comps: number;
  /** Your rival Dutch (0.2): duels won and lost, and when you last met. */
  rival: { wins: number; losses: number; last: number; coin: boolean };
  stats: {
    hands: number;
    duelsWon: number;
    duelsLost: number;
    biggestWin: number;
    peak: number;
  };
  over: null | "won" | "broke";
  log: LogLine[];
}

export type Interaction =
  | { kind: "talk"; npc: Npc }
  | { kind: "table"; table: TableDef }
  | { kind: "machine"; machine: MachineSpot }
  | { kind: "bar" }
  | { kind: "shop"; id: ShopId }
  | { kind: "video"; spot: VideoSpot }
  | { kind: "club" };

/** A finished hand of a house game, for heat and statistics. */
export interface HouseRound {
  /** Where it was played (for the pit boss). */
  table: { x: number; y: number };
  bet: number;
  net: number;
  min: number;
  /** Blackjack: the true count when the bet was made. */
  trueCount?: number;
  jackpot?: boolean;
  /** Extra heat from cheating. */
  cheat?: number;
}

export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
/** Turns between each point of heat cooling off. */
const COOL_EVERY = 3;
/** Heat at which security walks you out. */
export const HEAT_MAX = 100;
const DAY_START = 20 * 60;

// Floor events (0.2), as a chance per casino visit.
const HOT_TABLE_CHANCE = 0.3;
const MILLIONAIRE_CHANCE = 0.25;
const PICKPOCKET_CHANCE = 0.25;
const RIVAL_CHANCE = 0.4;
/** Turns between meetings with Dutch. */
const RIVAL_GAP = 250;
/** Dutch plays for this share of your bankroll. */
const RIVAL_SHARE = 0.25;
const RIVAL_MAX_STAKE = 50000;
const RIVAL_WINS_FOR_COIN = 3;
const MILLIONAIRE_BET = [50, 250, 1000, 2500, 5000];
const PICKPOCKET_MAX = [50, 250, 750, 2000, 5000];
const PICKPOCKET_REWARD = [25, 100, 250, 500, 1000];

/** 1,234 -> 1,200: two significant figures, for stakes. */
export function niceRound(n: number): number {
  if (n <= 0) return 0;
  const mag = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}

/** Any high roller by id, including the rival. */
export function rollerById(id: string): RollerDef {
  return id === RIVAL.id ? RIVAL : ROLLER_BY_ID[id];
}

/** All the game rules. Screens read `s` and `area`, call methods, and play `sounds`. */
export class Game {
  s: State;
  area!: Area;
  readonly strip: Area;
  rng: Rng;
  sounds: SoundId[] = [];
  private casinos = new Map<string, Area>();
  private shoes = new Map<string, Shoe>();
  /** Recent roulette results per table, newest last. */
  readonly spins = new Map<string, number[]>();
  /** Craps point per table. */
  readonly points = new Map<string, number | null>();
  /** A blackjack table paying 2:1 for a blackjack during this visit ("lucky hour"). */
  hotTable: string | null = null;
  private pitTarget = new Map<string, { x: number; y: number }>();

  private constructor(s: State) {
    this.s = s;
    this.strip = buildStrip();
    this.rng = new Rng(hashSeed(s.seed, s.turn, 4242));
  }

  static create(name: string, difficulty: Difficulty, seed: number): Game {
    const skills = Object.fromEntries(SKILL_ORDER.map((k) => [k, 0])) as Record<SkillId, number>;
    const cash = DIFFICULTY[difficulty].cash;
    const g = new Game({
      version: SAVE_VERSION,
      seed: seed >>> 0,
      name: name.trim() || "Ace",
      difficulty,
      turn: 0,
      clockShift: 0,
      area: "strip",
      x: 0,
      y: 0,
      cash,
      debt: 0,
      debtDue: 0,
      skills,
      pockets: [],
      buffs: [],
      heat: {},
      banned: {},
      beaten: [],
      chips: [],
      knownTells: [],
      visits: {},
      duel: null,
      stats: { hands: 0, duelsWon: 0, duelsLost: 0, biggestWin: 0, peak: cash },
      comps: 0,
      rival: { wins: 0, losses: 0, last: 0, coin: false },
      over: null,
      log: [],
    });
    g.enterArea("strip");
    g.log(`You step off the bus onto Ace Avenue with ${money(cash)} in your pocket.`, C.yellow);
    g.log(
      "Beat the high rollers of each casino, then its boss. The Baron waits at the top.",
      C.light,
    );
    g.log("Walk into tables, machines and people to play or talk. Press ? for help.", C.gray);
    g.sounds = [];
    return g;
  }

  static load(text: string): Game {
    const s = JSON.parse(text) as State;
    if (typeof s.version !== "number" || typeof s.cash !== "number" || !s.skills)
      throw new Error("This doesn't look like an Ace Avenue save.");
    if (s.version > SAVE_VERSION) throw new Error("This save is from a newer version of the game.");
    // 0.1 saves: no comp points and no rival yet.
    s.comps ??= 0;
    s.rival ??= { wins: 0, losses: 0, last: 0, coin: false };
    s.version = SAVE_VERSION;
    const g = new Game(s);
    g.area = g.areaFor(s.area);
    // Floors changed between versions: never leave you standing inside a table.
    if (!walkable(tileAt(g.area, s.x, s.y)) && tileAt(g.area, s.x, s.y) !== T.vipDoor) {
      s.x = g.area.entry.x;
      s.y = g.area.entry.y;
    }
    g.populate();
    if (s.duel) {
      // The game closed during a duel: you walked away with what was in front of you.
      const r = rollerById(s.duel.rollerId);
      s.cash += s.duel.stack;
      g.log(`You left ${r?.short ?? "the"} table with ${money(s.duel.stack)}.`, C.gray);
      s.duel = null;
    }
    return g;
  }

  save(): string {
    return JSON.stringify(this.s);
  }

  summary(): string {
    return `${this.s.name} - ${this.area.name} - ${DIFFICULTY[this.s.difficulty].label} - ${money(this.s.cash)}`;
  }

  log(text: string, color: string = C.light): void {
    this.s.log.push({ text, color });
    if (this.s.log.length > 80) this.s.log.splice(0, this.s.log.length - 80);
  }

  sound(id: SoundId): void {
    this.sounds.push(id);
  }

  // -------------------------------------------------------------------------------------------
  // Places

  private areaFor(id: string): Area {
    if (id === "strip") return this.strip;
    let a = this.casinos.get(id);
    if (!a) {
      const c = CASINOS[id as CasinoId];
      if (!c) throw new Error(`Unknown place: ${id}`);
      a = buildCasino(c, this.s.seed);
      this.casinos.set(id, a);
    }
    return a;
  }

  get casino(): CasinoDef | undefined {
    return this.area.casino;
  }

  /** The highest casino tier you can get into (1 + golden chips). */
  get tier(): number {
    return Math.min(5, this.s.chips.length + 1);
  }

  /** Goes somewhere. Coming out of a casino puts you on the Avenue outside its door. */
  enterArea(id: string, from?: string): void {
    this.area = this.areaFor(id);
    this.s.area = id;
    this.s.visits[id] = (this.s.visits[id] ?? 0) + 1;
    if (id === "strip") {
      const p = from ? stripDoor(this.strip, from) : null;
      this.s.x = p ? p.outX : this.strip.entry.x;
      this.s.y = p ? p.outY : this.strip.entry.y;
    } else {
      this.s.x = this.area.entry.x;
      this.s.y = this.area.entry.y;
      const c = this.area.casino as CasinoDef;
      this.log(`${c.name}. ${c.welcome}`, c.theme.accent);
    }
    this.pitTarget.clear();
    this.populate();
    this.sound("door");
    if (id === "strip") this.collectDebt();
  }

  /** Fills an area with the people who come and go. */
  private populate(): void {
    const a = this.area;
    a.npcs = a.npcs.filter((n) => n.kind === "roller" || n.kind === "bartender");
    const rng = new Rng(hashSeed(this.s.seed, this.s.visits[a.id] ?? 0, a.id.length * 31 + 7));
    const taken = new Set<number>(a.npcs.map((n) => n.y * a.w + n.x));
    taken.add(this.s.y * a.w + this.s.x);
    const place = (spots: { x: number; y: number }[]) => {
      for (let tries = 0; tries < 50; tries++) {
        const p = rng.pick(spots);
        const i = p.y * a.w + p.x;
        if (!taken.has(i) && Math.max(Math.abs(p.x - this.s.x), Math.abs(p.y - this.s.y)) > 2) {
          taken.add(i);
          return p;
        }
      }
      return null;
    };
    let n = 0;
    const add = (npc: Omit<Npc, "id" | "x" | "y">, at: { x: number; y: number } | null) => {
      if (at) a.npcs.push({ ...npc, id: `${npc.kind}${n++}`, x: at.x, y: at.y });
    };
    if (a.kind === "strip") {
      const walk = openSquares(a, [T.sidewalk]);
      for (let i = 0; i < 6; i++)
        add(
          {
            kind: "pedestrian",
            glyph: "☺",
            color: rng.pick([C.light, C.tan, C.pink, C.cyan, C.lime]),
            name: "a passer-by",
            wander: true,
            line: rng.pick(STREET_LINES),
          },
          place(walk),
        );
      if (this.s.debt > 0 && this.s.turn > this.s.debtDue - 100)
        add(
          {
            kind: "collector",
            glyph: "k",
            color: C.red,
            name: "Knuckles, Vinnie's collector",
            wander: true,
            line:
              this.s.turn > this.s.debtDue
                ? "Vinnie's money. Now."
                : "Vinnie says hi. Vinnie says don't forget.",
          },
          place(walk),
        );
      return;
    }
    const floor = openSquares(a, [T.floor]);
    const tips = this.tipsFor(rng);
    for (let i = 0; i < 8; i++) {
      const tip = i < 4 && tips.length ? tips.shift() : undefined;
      add(
        {
          kind: "patron",
          glyph: "☺",
          color: rng.pick([C.light, C.tan, C.pink, C.cyan, C.lime, C.amber, C.steel]),
          name: "a gambler",
          wander: true,
          line: rng.pick(PATRON_LINES),
          tip,
        },
        place(floor),
      );
    }
    for (let i = 0; i < 2; i++)
      add(
        { kind: "waitress", glyph: "w", color: C.pink, name: "a cocktail waitress", wander: true },
        place(floor),
      );
    add(
      { kind: "pitboss", glyph: "Ω", color: C.red, name: "the pit boss", wander: true },
      place(floor),
    );
    for (const x of [34, 39])
      add(
        { kind: "security", glyph: "§", color: C.blue, name: "security", wander: false },
        { x, y: 21 },
      );
    this.floorEvents(rng, floor, place, add);
  }

  /** Things that might be going on during this visit. */
  private floorEvents(
    rng: Rng,
    floor: { x: number; y: number }[],
    place: (spots: { x: number; y: number }[]) => { x: number; y: number } | null,
    add: (npc: Omit<Npc, "id" | "x" | "y">, at: { x: number; y: number } | null) => void,
  ): void {
    const a = this.area;
    this.hotTable = null;
    const bj = a.tables.filter((t) => t.kind === "blackjack" && (t.rules?.bjPays ?? 0) >= 1.5);
    if (bj.length && rng.chance(HOT_TABLE_CHANCE)) {
      const t = rng.pick(bj);
      this.hotTable = t.id;
      this.log(
        `Lucky hour! A blackjack pays 2 to 1 at ${t.label} (${t.region}) while you're here.`,
        C.gold,
      );
    }
    if (rng.chance(MILLIONAIRE_CHANCE))
      add(
        {
          kind: "millionaire",
          glyph: "☻",
          color: C.gold,
          name: "a tipsy millionaire",
          wander: true,
          line: "Hey! You! Kid! Cut the deck with me! High card wins! Ties go to you, I'm feeling generous!",
        },
        place(floor),
      );
    if (rng.chance(PICKPOCKET_CHANCE))
      add(
        {
          kind: "pickpocket",
          glyph: "☺",
          color: C.light,
          name: "a gambler",
          wander: true,
          line: "",
        },
        place(floor),
      );
    // Dutch never sets foot on the riverboat: he gets seasick.
    if (!a.casino?.side && this.canMeetRival() && rng.chance(RIVAL_CHANCE)) {
      add(
        {
          kind: "rival",
          glyph: RIVAL.glyph,
          color: RIVAL.color,
          name: RIVAL.name,
          wander: true,
          rollerId: RIVAL.id,
        },
        place(floor),
      );
      this.s.rival.last = this.s.turn;
      this.log(
        "Somebody whistles at you across the floor. It's Dutch Calloway, your rival.",
        C.orange,
      );
    }
  }

  canMeetRival(): boolean {
    return this.s.turn - this.s.rival.last >= RIVAL_GAP && this.s.cash >= 100;
  }

  /** Gossip for this visit: some true, some not (Charm makes it more reliable). */
  private tipsFor(rng: Rng): Tip[] {
    const a = this.area;
    const c = a.casino as CasinoDef;
    const price = [5, 20, 50, 100, 200][c.tier - 1];
    const truths: Tip[] = [];
    for (const m of a.machines)
      if (m.def.looseness === "loose")
        truths.push({
          text: `Psst - machine ${m.n} in the ${m.region} pays like a busted piggy bank.`,
          price,
        });
    for (const t of a.tables)
      if (t.wheel?.bias.length)
        truths.push({
          text: `${t.label} in the ${t.region} keeps landing near ${t.wheel.bias[2] === 37 ? "00" : t.wheel.bias[2]}. Old wheel.`,
          price,
        });
    for (const r of [...c.rollers, c.boss])
      if (r.tellTip && !this.s.knownTells.includes(r.id))
        truths.push({ text: r.tellTip, price, tell: r.id });
    const lies: Tip[] = [];
    for (const m of a.machines)
      if (m.def.looseness === "tight")
        lies.push({ text: `Machine ${m.n} in the ${m.region} is due. Any minute now.`, price });
    for (const t of a.tables)
      if (t.wheel && !t.wheel.bias.length)
        lies.push({
          text: `${t.label} in the ${t.region} has a lean on it. Bet the zero side.`,
          price,
        });
    rng.shuffle(truths);
    rng.shuffle(lies);
    const reliable = 0.6 + 0.12 * this.skill("charm");
    const out: Tip[] = [];
    for (let i = 0; i < 4; i++) {
      const tip = rng.chance(reliable) ? truths.pop() : lies.pop();
      if (tip) out.push(tip);
    }
    return out;
  }

  /** Can you get into this casino? */
  canEnter(id: CasinoId): { ok: boolean; why: string } {
    const c = CASINOS[id];
    if (c.tier > 1) {
      const need = CASINOS[CASINO_ORDER[c.tier - 2]];
      if (!this.s.chips.includes(need.id))
        return {
          ok: false,
          why: c.side
            ? `A deckhand blocks the gangplank. "Cap'n only lets high rollers aboard. Show me ${need.name}'s golden chip."`
            : `The doorman blocks the way. "Members only. Come back with ${need.name}'s golden chip."`,
        };
    }
    if (this.s.banned[id]) {
      const lift = 50 + 10 * this.skill("charm");
      if ((this.s.heat[id] ?? 0) >= lift)
        return {
          ok: false,
          why: `Security recognizes you. "Not tonight, pal." (Heat ${this.s.heat[id]} - wait for it to cool below ${lift}, or sleep it off at the motel.)`,
        };
      this.s.banned[id] = false;
    }
    return { ok: true, why: "" };
  }

  // -------------------------------------------------------------------------------------------
  // Walking

  npcAt(x: number, y: number): Npc | undefined {
    return this.area.npcs.find((n) => n.x === x && n.y === y);
  }

  tableAt(x: number, y: number): TableDef | undefined {
    return this.area.tables.find((t) => x >= t.x && y >= t.y && x < t.x + t.w && y < t.y + t.h);
  }

  machineAt(x: number, y: number): MachineSpot | undefined {
    return this.area.machines.find((m) => m.x === x && m.y === y);
  }

  vipOpen(): boolean {
    const c = this.area.casino;
    return !!c && c.rollers.every((r) => this.s.beaten.includes(r.id));
  }

  /** Steps one square, or bumps into whatever is there. */
  move(dx: number, dy: number): Interaction | null {
    if (this.s.over) return null;
    const x = this.s.x + dx;
    const y = this.s.y + dy;
    const npc = this.npcAt(x, y);
    if (npc) {
      if (npc.kind === "bartender" || npc.kind === "waitress") return { kind: "bar" };
      return { kind: "talk", npc };
    }
    const t = tileAt(this.area, x, y);
    if (t === T.door) {
      const door = this.area.doors.find((d) => d.x === x && d.y === y);
      if (!door) return null;
      if (door.target in CASINOS) {
        const id = door.target as CasinoId;
        const ok = this.canEnter(id);
        if (!ok.ok) {
          this.log(ok.why, C.orange);
          this.sound("deny");
          return null;
        }
        this.enterArea(id);
        return null;
      }
      this.sound("door");
      return { kind: "shop", id: door.target as ShopId };
    }
    if (t === T.felt || t === T.wheel) {
      const table = this.tableAt(x, y);
      if (!table) return null;
      if (table.kind === "duel") {
        const roller = this.area.npcs.find((n) => n.rollerId === table.rollerId);
        return roller ? { kind: "talk", npc: roller } : null;
      }
      return { kind: "table", table };
    }
    if (t === T.machine) {
      const m = this.machineAt(x, y);
      return m ? { kind: "machine", machine: m } : null;
    }
    if (t === T.bar) return { kind: "bar" };
    if (t === T.video) {
      const spot = this.area.videos.find((v) => v.x === x && v.y === y);
      return spot ? { kind: "video", spot } : null;
    }
    if (t === T.cage) return { kind: "club" };
    if (t === T.vipDoor && !this.vipOpen()) {
      const c = this.area.casino as CasinoDef;
      const left = c.rollers.filter((r) => !this.s.beaten.includes(r.id));
      this.log(
        `A bouncer at the velvet rope: "The VIP room is for players who've beaten our high rollers." Still to beat: ${left.map((r) => r.short).join(", ")}.`,
        C.orange,
      );
      this.sound("deny");
      return null;
    }
    if (!walkable(t) && t !== T.vipDoor) return null;
    this.s.x = x;
    this.s.y = y;
    this.tick(1);
    if (t === T.exit) this.enterArea("strip", this.area.id);
    return null;
  }

  wait(): void {
    if (!this.s.over) this.tick(1);
  }

  /** Time passes: heat cools, drinks wear off, people wander. */
  tick(turns: number): void {
    for (let i = 0; i < turns; i++) {
      this.s.turn++;
      if (this.s.turn % COOL_EVERY === 0) {
        const cool = this.has("watch") ? 2 : 1;
        for (const id of Object.keys(this.s.heat) as CasinoId[])
          this.s.heat[id] = Math.max(0, (this.s.heat[id] ?? 0) - cool);
      }
      const expired = this.s.buffs.filter((b) => b.until <= this.s.turn);
      if (expired.length) {
        this.s.buffs = this.s.buffs.filter((b) => b.until > this.s.turn);
        for (const b of expired) this.log(`Your ${DRINKS[b.id].name} wears off.`, C.gray);
      }
      if (this.s.debt > 0 && this.s.turn === this.s.debtDue)
        this.log("Your loan from Vinnie is due. His collector will come looking.", C.red);
    }
    this.npcTurn();
  }

  private npcTurn(): void {
    const a = this.area;
    this.pickpocketTurn();
    const occupied = (x: number, y: number) =>
      (x === this.s.x && y === this.s.y) || a.npcs.some((n) => n.x === x && n.y === y);
    for (const n of a.npcs) {
      if (!n.wander || this.rng.chance(0.45)) continue;
      let dx = this.rng.int(-1, 1);
      let dy = this.rng.int(-1, 1);
      if (n.kind === "pitboss" && a.tables.length) {
        let target = this.pitTarget.get(n.id);
        if (!target || (Math.abs(target.x - n.x) <= 2 && Math.abs(target.y - n.y) <= 2)) {
          const t = this.rng.pick(a.tables.filter((tb) => tb.id !== "vip"));
          target = t ? { x: t.x + 2, y: t.y + t.h } : { x: n.x, y: n.y };
          this.pitTarget.set(n.id, target);
        }
        if (this.rng.chance(0.7)) {
          dx = Math.sign(target.x - n.x);
          dy = Math.sign(target.y - n.y);
        }
      }
      const near = Math.max(Math.abs(this.s.x - n.x), Math.abs(this.s.y - n.y));
      if (n.kind === "collector" || (n.kind === "pickpocket" && near <= 8)) {
        dx = Math.sign(this.s.x - n.x);
        dy = Math.sign(this.s.y - n.y);
      }
      const x = n.x + dx;
      const y = n.y + dy;
      const t = tileAt(a, x, y);
      const ok =
        a.kind === "strip"
          ? t === T.sidewalk || (n.kind === "collector" && walkable(t))
          : t === T.floor || t === T.lobby;
      if (ok && !occupied(x, y)) {
        n.x = x;
        n.y = y;
      }
    }
  }

  /** Is the pit boss near this table? Heat doubles while he watches. */
  watched(t: { x: number; y: number }): boolean {
    return this.area.npcs.some(
      (n) => n.kind === "pitboss" && Math.max(Math.abs(n.x - t.x - 2), Math.abs(n.y - t.y)) <= 6,
    );
  }

  // -------------------------------------------------------------------------------------------
  // You

  has(item: ItemId): boolean {
    return this.s.pockets.includes(item);
  }

  /** A skill with items and drinks counted, capped at its maximum. */
  skill(id: SkillId): number {
    let v = this.s.skills[id];
    for (const item of new Set(this.s.pockets)) {
      const sk = ITEMS[item].skill;
      if (sk && sk[0] === id) v += sk[1];
    }
    for (const b of this.s.buffs) v += DRINKS[b.id].skills?.[id] ?? 0;
    return Math.max(0, Math.min(SKILLS[id].max, v));
  }

  heatIn(id: CasinoId): number {
    return this.s.heat[id] ?? 0;
  }

  heatHere(): number {
    const c = this.area.casino;
    return c ? this.heatIn(c.id) : 0;
  }

  /** Adds heat in the current casino. Returns true if security walked you out. */
  addHeat(amount: number): boolean {
    const c = this.area.casino;
    if (!c || amount <= 0) return false;
    const mult =
      DIFFICULTY[this.s.difficulty].heat *
      (1 - 0.15 * this.skill("charm")) *
      (this.has("horseshoe") ? 0.75 : 1);
    const add = Math.max(1, Math.round(amount * mult));
    this.s.heat[c.id] = Math.min(HEAT_MAX, this.heatIn(c.id) + add);
    if (this.heatIn(c.id) >= HEAT_MAX) {
      this.s.banned[c.id] = true;
      this.log(
        `Two large men in suits appear at your elbows. Security walks you out of ${c.name}.`,
        C.red,
      );
      this.log(
        "You're banned until things cool down (or you sleep it off at the motel).",
        C.orange,
      );
      this.sound("alarm");
      this.enterArea("strip", c.id);
      return true;
    }
    return false;
  }

  /** Takes money for a bet or a purchase. */
  pay(amount: number): boolean {
    if (amount > this.s.cash || amount < 0) return false;
    this.s.cash -= amount;
    return true;
  }

  receive(amount: number): void {
    this.s.cash += amount;
    this.s.stats.peak = Math.max(this.s.stats.peak, this.s.cash);
  }

  /** Records a house game hand: statistics, time, heat. Returns true if you got thrown out. */
  houseResult(r: HouseRound): boolean {
    this.s.stats.hands++;
    this.s.comps += r.bet / this.compUnit;
    if (r.net > this.s.stats.biggestWin) this.s.stats.biggestWin = r.net;
    this.s.stats.peak = Math.max(this.s.stats.peak, this.s.cash);
    let heat = 0;
    if (r.trueCount !== undefined && r.trueCount >= 2 && r.bet >= r.min * 4) heat += 5;
    if (r.net >= r.min * 15) heat += 3;
    if (r.jackpot) heat += 6;
    heat += r.cheat ?? 0;
    if (heat > 0 && this.watched(r.table)) heat *= 2;
    this.tick(1);
    this.checkBroke();
    return this.addHeat(heat);
  }

  /** Out of money with nothing to sell and nobody left to borrow from: the run is over. */
  checkBroke(): void {
    if (this.s.over || this.s.cash >= 1 || this.s.duel) return;
    if (this.s.pockets.length) {
      this.log(
        "You're broke! Honest Abe's Pawn on the Avenue buys what's in your pockets.",
        C.orange,
      );
      return;
    }
    if (this.s.debt <= 0) {
      this.log(
        "You're flat broke. Vinnie's Easy Money on the Avenue might spot you a loan...",
        C.orange,
      );
      return;
    }
    this.s.over = "broke";
    this.log(
      "Not a cent left, nothing to pawn, and Vinnie won't lend another dime. Busted.",
      C.red,
    );
  }

  // -------------------------------------------------------------------------------------------
  // Clock

  clock(): { day: number; time: string } {
    const m = DAY_START + this.s.turn + this.s.clockShift;
    const day = Math.floor(m / 1440) + 1;
    const mins = m % 1440;
    const h = Math.floor(mins / 60);
    const mm = String(mins % 60).padStart(2, "0");
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return { day, time: `${h12}:${mm} ${h < 12 ? "AM" : "PM"}` };
  }

  // -------------------------------------------------------------------------------------------
  // Drinks, gossip and shops

  drinkPrice(id: DrinkId): number {
    const tier = this.casino?.tier ?? 1;
    return Math.round(DRINKS[id].price * tier * (1 - 0.1 * this.skill("charm")));
  }

  buyDrink(id: DrinkId): string | null {
    const d = DRINKS[id];
    const price = this.drinkPrice(id);
    if (!this.pay(price)) return `You can't afford a ${d.name}.`;
    if (d.cool && this.casino) {
      const cid = this.casino.id;
      this.s.heat[cid] = Math.max(0, this.heatIn(cid) - d.cool);
    }
    if (d.skills) {
      this.s.buffs = this.s.buffs.filter((b) => b.id !== id);
      const turns = DRINK_TURNS * (this.has("flask") ? 2 : 1);
      this.s.buffs.push({ id, until: this.s.turn + turns });
    }
    this.log(`You have a ${d.name}${price ? ` (${money(price)})` : ""}. ${d.text}`, C.cyan);
    this.sound(price ? "coin" : "chip");
    this.tick(1);
    return null;
  }

  /** Pays a gambler for their gossip. */
  buyTip(npc: Npc): string | null {
    const tip = npc.tip;
    if (!tip) return null;
    if (!this.pay(tip.price)) return "You can't spare that much.";
    this.log(`Gossip: "${tip.text}"`, C.cyan);
    if (tip.tell && !this.s.knownTells.includes(tip.tell)) this.s.knownTells.push(tip.tell);
    npc.tip = undefined;
    npc.line = "That's all I know, friend.";
    this.sound("coin");
    return null;
  }

  /** What the pit boss, guards and others say. */
  lineFor(npc: Npc): string {
    if (npc.kind === "pitboss") {
      const h = this.heatHere();
      let line = PIT_BOSS_LINES[0][1];
      for (const [at, text] of PIT_BOSS_LINES) if (h >= at) line = text;
      return line;
    }
    if (npc.kind === "security")
      return SECURITY_LINES[(npc.x + this.s.turn) % SECURITY_LINES.length];
    return npc.line ?? "...";
  }

  lessonPrice(id: SkillId): number | null {
    const level = this.s.skills[id];
    return level < SKILLS[id].max ? SKILLS[id].prices[level] : null;
  }

  buyLesson(id: SkillId): string | null {
    const price = this.lessonPrice(id);
    if (price === null) return "You already know everything the Professor can teach about that.";
    if (!this.pay(price)) return "Lessons aren't free, kid.";
    this.s.skills[id]++;
    this.log(
      `You learn ${SKILLS[id].name} ${this.s.skills[id]}: ${SKILLS[id].levels[this.s.skills[id] - 1]}`,
      C.yellow,
    );
    this.sound("levelup");
    this.tick(30);
    return null;
  }

  charmStock(): ItemId[] {
    return CHARM_STOCK.slice(0, Math.min(CHARM_STOCK.length, this.s.chips.length + 1)).flat();
  }

  /** Honest Abe's cases: they change each time you visit. */
  pawnStock(): { id: ItemId; price: number }[] {
    const rng = new Rng(hashSeed(this.s.seed, this.s.visits.pawn ?? 0, 1313));
    const all = Object.keys(ITEMS) as ItemId[];
    rng.shuffle(all);
    return all
      .slice(0, PAWN_STOCK)
      .map((id) => ({ id, price: Math.round(ITEMS[id].price * PAWN_SELLS) }));
  }

  sellPrice(item: ItemId): number {
    return Math.round(ITEMS[item].price * PAWN_BUYS);
  }

  buyItem(item: ItemId, price: number): string | null {
    if (this.s.pockets.length >= POCKET_SIZE) return "Your pockets are full.";
    if (!ITEMS[item].consumable && this.has(item)) return "You already have one of those.";
    if (!this.pay(price)) return "You can't afford that.";
    this.s.pockets.push(item);
    this.log(`You buy a ${ITEMS[item].name} for ${money(price)}.`, C.green);
    this.sound("buy");
    return null;
  }

  sellItem(index: number): string | null {
    const item = this.s.pockets[index];
    if (!item) return null;
    const price = this.sellPrice(item);
    this.s.pockets.splice(index, 1);
    this.receive(price);
    this.log(`Honest Abe gives you ${money(price)} for your ${ITEMS[item].name}.`, C.amber);
    this.sound("coin");
    return null;
  }

  /** Uses up one of a consumable item. */
  useItem(item: ItemId): boolean {
    const i = this.s.pockets.indexOf(item);
    if (i < 0) return false;
    this.s.pockets.splice(i, 1);
    return true;
  }

  get motelPrice(): number {
    return MOTEL_PRICE * this.tier;
  }

  /** A night at the motel: security everywhere forgets your face. */
  sleep(): string | null {
    if (!this.pay(this.motelPrice)) return "No money, no room.";
    this.s.heat = {};
    this.s.banned = {};
    const m = (DAY_START + this.s.turn + this.s.clockShift) % 1440;
    const noon = 12 * 60;
    this.s.clockShift += m < noon ? noon - m : 1440 - m + noon;
    this.s.buffs = [];
    this.log(
      "You sleep like a baby. The Avenue forgets your face; every casino's heat is gone.",
      C.pink,
    );
    this.sound("buy");
    return null;
  }

  get loanSize(): number {
    return LOAN_SIZE * this.tier;
  }

  borrow(): string | null {
    if (this.s.debt > 0) return '"Pay what you owe first, then we talk."';
    const amount = this.loanSize;
    this.s.debt = Math.round(amount * (1 + LOAN_INTEREST));
    this.s.debtDue = this.s.turn + LOAN_TERM;
    this.receive(amount);
    this.log(
      `Vinnie counts out ${money(amount)}. You owe him ${money(this.s.debt)}, due in ${LOAN_TERM} turns.`,
      C.red,
    );
    this.sound("coin");
    return null;
  }

  repay(): string | null {
    if (this.s.debt <= 0) return "\"You don't owe me nothin'. Yet.\"";
    const amount = Math.min(this.s.cash, this.s.debt);
    if (amount <= 0) return '"Come back when you got somethin\'."';
    this.pay(amount);
    this.s.debt -= amount;
    this.log(
      this.s.debt > 0
        ? `You pay Vinnie ${money(amount)}. Still owing ${money(this.s.debt)}.`
        : `You pay Vinnie off in full. "Pleasure doin' business."`,
      C.amber,
    );
    this.sound("coin");
    return null;
  }

  /** Vinnie's collector finds you on the Avenue once your loan is overdue. */
  private collectDebt(): void {
    if (this.s.debt <= 0 || this.s.turn <= this.s.debtDue) return;
    const take = Math.min(this.s.cash, this.s.debt);
    if (take > 0) {
      this.s.cash -= take;
      this.s.debt -= take;
      this.log(
        `Knuckles, Vinnie's collector, takes ${money(take)} off you on the sidewalk.${this.s.debt > 0 ? ` You still owe ${money(this.s.debt)}.` : " Debt paid."}`,
        C.red,
      );
      this.sound("lose");
    }
    if (this.s.debt > 0) this.s.debtDue = this.s.turn + 150;
    this.checkBroke();
  }

  // -------------------------------------------------------------------------------------------
  // High roller duels

  shopName(id: ShopId): string {
    return SHOPS[id].name;
  }

  beaten(rollerId: string): boolean {
    return this.s.beaten.includes(rollerId);
  }

  /** Sits down with a high roller: your stake goes on the table. */
  startDuel(r: RollerDef): string | null {
    if (this.beaten(r.id)) return `${r.short} has nothing left to play with.`;
    if (this.s.cash < r.stake)
      return `You need ${money(r.stake)} to sit down with ${r.short}. You have ${money(this.s.cash)}.`;
    this.pay(r.stake);
    this.s.duel = { rollerId: r.id, stack: r.stake, stake: r.stake };
    this.log(`You sit down with ${r.name} for ${money(r.stake)} each.`, r.color);
    this.sound("shuffle");
    return null;
  }

  /** Keeps the save up to date with what's in front of you during a duel. */
  duelStack(stack: number): void {
    if (this.s.duel) this.s.duel.stack = stack;
  }

  /** The duel is over: you take what's in front of you. */
  endDuel(result: "won" | "lost" | "left", stack: number, note?: string): void {
    const d = this.s.duel;
    if (!d) return;
    const r = rollerById(d.rollerId);
    this.s.duel = null;
    if (r.id === RIVAL.id) {
      this.endRivalDuel(result, stack, d.stake ?? r.stake, !!note);
      return;
    }
    this.receive(stack);
    this.tick(10);
    if (result === "won") {
      this.s.beaten.push(r.id);
      this.s.stats.duelsWon++;
      this.log(`You clean out ${r.name}! You walk away with ${money(stack)}.`, C.yellow);
      this.sound("bigwin");
      if (r.reward) {
        this.s.pockets.push(r.reward);
        this.log(
          `${r.short} gives you a ${ITEMS[r.reward].name}: ${ITEMS[r.reward].text}`,
          C.green,
        );
      }
      if (r.boss && CASINOS[ROLLER_CASINO[r.id]].side) {
        // The riverboat captain has no golden chip. He gives you the Baron's tell instead.
        if (!this.s.knownTells.includes("baron")) this.s.knownTells.push("baron");
        this.log(
          "The Captain tells you how he beat the Baron: he fusses with his cravat when he's in trouble.",
          C.gold,
        );
      } else if (r.boss) {
        const cid = ROLLER_CASINO[r.id];
        if (!this.s.chips.includes(cid)) this.s.chips.push(cid);
        if (r.id === "baron") {
          this.s.over = "won";
          this.log("You are the new king of Ace Avenue!", C.gold);
        } else {
          const next = CASINOS[CASINO_ORDER[CASINOS[cid].tier]];
          this.log(
            `You win ${CASINOS[cid].name}'s golden chip! ${next.name} will let you in now.`,
            C.gold,
          );
        }
      }
    } else if (result === "lost") {
      this.s.stats.duelsLost++;
      this.log(note ?? `${r.name} cleans you out.`, C.red);
      this.sound("lose");
      if (!note) this.claimPolicy(d.stake ?? r.stake);
      this.checkBroke();
    } else {
      this.log(`You get up from ${r.short}'s table with ${money(stack)}.`, C.gray);
      this.checkBroke();
    }
  }

  /** Poker tells you've learned from gossip. */
  knowsTell(rollerId: string): boolean {
    return this.s.knownTells.includes(rollerId);
  }

  /** How cagey the high rollers are on this difficulty. */
  get faceBonus(): number {
    return DIFFICULTY[this.s.difficulty].face;
  }

  // -------------------------------------------------------------------------------------------
  // The rival

  /** Dutch, set up for a duel now: he plays for a share of your bankroll and gets sharper. */
  rivalDef(): RollerDef {
    const met = this.s.rival.wins + this.s.rival.losses;
    const p = RIVAL.persona as PokerPersona;
    const stake = Math.min(RIVAL_MAX_STAKE, Math.max(100, niceRound(this.s.cash * RIVAL_SHARE)));
    return {
      ...RIVAL,
      stake,
      persona: {
        ...p,
        aggro: Math.min(0.9, p.aggro + met * 0.04),
        face: Math.min(0.9, p.face + met * 0.05),
      },
    };
  }

  /** The Insurance Policy pays back half the stake when a high roller cleans you out. */
  private claimPolicy(stake: number): void {
    if (!this.useItem("policy")) return;
    const back = Math.round(stake / 2);
    this.receive(back);
    this.log(
      `Your Insurance Policy pays out ${money(back)}. Pettibone would be proud. (It's used up.)`,
      C.lime,
    );
  }

  private endRivalDuel(
    result: "won" | "lost" | "left",
    stack: number,
    stake: number,
    cheated: boolean,
  ): void {
    const rv = this.s.rival;
    this.receive(stack);
    this.tick(10);
    this.area.npcs = this.area.npcs.filter((n) => n.kind !== "rival");
    rv.last = this.s.turn;
    if (result === "won") {
      rv.wins++;
      this.log(
        `You beat Dutch Calloway and pocket ${money(stack)}! (${rv.wins} win${rv.wins === 1 ? "" : "s"} against him.)`,
        C.yellow,
      );
      this.sound("bigwin");
      if (rv.wins >= RIVAL_WINS_FOR_COIN && !rv.coin) {
        rv.coin = true;
        this.s.pockets.push("dutchcoin");
        this.log(
          `Dutch flips you his lucky coin. "Keep it. I'll win it back." (${ITEMS.dutchcoin.text})`,
          C.green,
        );
      }
    } else if (result === "lost") {
      rv.losses++;
      this.log("Dutch rakes in your money with a grin and strolls off.", C.red);
      this.sound("lose");
      if (!cheated) this.claimPolicy(stake);
      this.checkBroke();
    } else {
      this.log(
        `You walk away from Dutch with ${money(stack)}. "Chicken!" he calls after you.`,
        C.gray,
      );
      this.checkBroke();
    }
  }

  // -------------------------------------------------------------------------------------------
  // Floor events

  /** The tipsy millionaire: cut the deck for a big bet. Returns the cards and the result. */
  cutDeck(npc: Npc): { yours: Card; theirs: Card; bet: number; won: boolean } | string {
    if (npc.kind !== "millionaire") return "...";
    const bet = this.millionaireBet();
    if (bet < 1) return "You don't have anything to bet.";
    const deck = this.rng.shuffle(newDeck());
    const yours = deck[0];
    const theirs = deck[1];
    const won = yours.rank >= theirs.rank;
    this.pay(bet);
    if (won) this.receive(bet * 2);
    this.log(
      won
        ? `You cut a ${cardName(yours)} to the millionaire's ${cardName(theirs)} and win ${money(bet)}!`
        : `Your ${cardName(yours)} loses to the millionaire's ${cardName(theirs)}. There goes ${money(bet)}.`,
      won ? C.lime : C.red,
    );
    this.sound(won ? "bigwin" : "lose");
    npc.kind = "patron";
    npc.glyph = "☺";
    npc.name = "a happy millionaire";
    npc.line = won ? "Ha! Easy come, easy go! Barkeep!" : "Ha! Thanks for playing, kid!";
    this.checkBroke();
    return { yours, theirs, bet, won };
  }

  /** What the millionaire wants to bet you (no more than you have). */
  millionaireBet(): number {
    return Math.min(this.s.cash, MILLIONAIRE_BET[(this.casino?.tier ?? this.tier) - 1]);
  }

  /** Bumping into the pickpocket first: you catch him. */
  catchPickpocket(npc: Npc): string {
    const reward = PICKPOCKET_REWARD[(this.casino?.tier ?? this.tier) - 1];
    this.area.npcs = this.area.npcs.filter((n) => n !== npc);
    this.receive(reward);
    this.log(
      `You bump into a shifty gambler and a pile of stolen wallets spills out of his coat. Security hauls him off and the casino thanks you with ${money(reward)}.`,
      C.lime,
    );
    this.sound("coin");
    return `A pile of stolen wallets falls out of his coat! Security grabs him and slips you ${money(reward)} for your trouble.`;
  }

  /** A pickpocket next to you tries his luck; Charm helps you notice. */
  private pickpocketTurn(): void {
    const a = this.area;
    const pp = a.npcs.find((n) => n.kind === "pickpocket");
    if (!pp) return;
    const close = Math.max(Math.abs(pp.x - this.s.x), Math.abs(pp.y - this.s.y)) <= 1;
    if (!close || !pp.ready) {
      // He needs a turn beside you before he strikes: your chance to bump into him first.
      pp.ready = close;
      if (close && this.skill("charm") >= 2)
        this.log("A gambler sidles up a little too close...", C.orange);
      return;
    }
    a.npcs = a.npcs.filter((n) => n !== pp);
    if (this.rng.chance(0.25 + 0.2 * this.skill("charm"))) {
      this.log(
        "You feel a hand slip into your pocket - and grab it! The pickpocket wriggles free and bolts.",
        C.lime,
      );
      return;
    }
    const take = Math.min(
      Math.floor(this.s.cash * 0.1),
      PICKPOCKET_MAX[(this.casino?.tier ?? this.tier) - 1],
    );
    if (take <= 0) return;
    this.s.cash -= take;
    this.log(
      `Someone brushes past you. A minute later your pocket is ${money(take)} lighter. Pickpocket!`,
      C.red,
    );
    this.sound("lose");
    this.checkBroke();
  }

  // -------------------------------------------------------------------------------------------
  // The Players' Club

  /** One comp point per table minimum wagered at the house games. */
  get compUnit(): number {
    return COMP_UNIT[(this.casino?.tier ?? this.tier) - 1];
  }

  clubPrice(id: ClubRewardId): number {
    return CLUB_REWARDS.find((r) => r.id === id)?.points ?? 0;
  }

  redeem(id: ClubRewardId): string | null {
    const reward = CLUB_REWARDS.find((r) => r.id === id);
    if (!reward) return null;
    if (Math.floor(this.s.comps) < reward.points) return "You don't have enough points for that.";
    if (reward.item && this.s.pockets.length >= POCKET_SIZE) return "Your pockets are full.";
    this.s.comps -= reward.points;
    const c = this.casino;
    if (id === "soda" && c) this.s.heat[c.id] = Math.max(0, this.heatIn(c.id) - 25);
    else if (id === "cash") this.receive(this.compUnit * 3);
    else if (id === "suite") {
      this.s.heat = {};
      this.s.banned = {};
    } else if (reward.item) this.s.pockets.push(reward.item);
    this.log(`Players' Club: ${reward.label}. ${reward.text}`, C.gold);
    this.sound("buy");
    return null;
  }

  // -------------------------------------------------------------------------------------------
  // House games

  /** The shoe at a blackjack table (shared between visits until it's reshuffled). */
  shoe(t: TableDef): Shoe {
    let s = this.shoes.get(`${this.area.id}:${t.id}`);
    if (!s) {
      s = new Shoe(t.rules?.decks ?? 6, this.rng);
      this.shoes.set(`${this.area.id}:${t.id}`, s);
    }
    return s;
  }

  /** A private shoe for a duel. */
  duelShoe(decks: number): Shoe {
    return new Shoe(decks, this.rng, decks === 1 ? 0.65 : 0.75);
  }

  spinHistory(t: TableDef): number[] {
    const key = `${this.area.id}:${t.id}`;
    let h = this.spins.get(key);
    if (!h) {
      h = [];
      this.spins.set(key, h);
    }
    return h;
  }
}
