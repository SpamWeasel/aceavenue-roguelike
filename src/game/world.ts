import type { BjRules } from "./blackjack";
import { C } from "./colors";
import { CASINO_ORDER, CASINOS, type CasinoDef, type CasinoId } from "./data/casinos";
import { SHOPS, type ShopId } from "./data/shops";
import { hashSeed, Rng } from "./rng";
import { makeWheel, type WheelDef } from "./roulette";
import { type MachineDef, makeMachine } from "./slots";
import type { VpTableId } from "./videopoker";

/** Map squares. */
export const T = {
  floor: 0,
  wall: 1,
  felt: 2,
  machine: 3,
  bar: 4,
  exit: 5,
  door: 6,
  vipDoor: 7,
  plant: 8,
  pillar: 9,
  sidewalk: 10,
  road: 11,
  lane: 12,
  building: 13,
  vipFloor: 14,
  wheel: 15,
  palm: 16,
  lamp: 17,
  cage: 18,
  lobby: 19,
  shelf: 20,
  video: 21,
} as const;
export type Tile = (typeof T)[keyof typeof T];

const WALKABLE = new Set<number>([
  T.floor,
  T.exit,
  T.sidewalk,
  T.road,
  T.lane,
  T.vipFloor,
  T.lobby,
]);
export const walkable = (t: number) => WALKABLE.has(t);

export const MAP_W = 74;
export const MAP_H = 24;

export type TableKind = "blackjack" | "roulette" | "craps" | "baccarat" | "duel";

export interface TableDef {
  id: string;
  kind: TableKind;
  x: number;
  y: number;
  w: number;
  h: number;
  min: number;
  max: number;
  rules?: BjRules;
  wheel?: WheelDef;
  rollerId?: string;
  /** "the north-west", for gossip. */
  region: string;
  label: string;
}

/** A video poker machine. */
export interface VideoSpot {
  id: string;
  x: number;
  y: number;
  table: VpTableId;
  coin: number;
  region: string;
  n: number;
}

export interface MachineSpot {
  id: string;
  x: number;
  y: number;
  def: MachineDef;
  coin: number;
  /** Which bank and which machine from the left, for gossip. */
  region: string;
  n: number;
}

export interface DoorDef {
  x: number;
  y: number;
  /** A casino or a shop. */
  target: CasinoId | ShopId;
  /** Where you stand after coming out. */
  outX: number;
  outY: number;
}

export interface Sign {
  x: number;
  y: number;
  text: string;
  fg: string;
}

export type NpcKind =
  | "patron"
  | "waitress"
  | "pitboss"
  | "security"
  | "bartender"
  | "roller"
  | "pedestrian"
  | "collector"
  | "millionaire"
  | "pickpocket"
  | "rival";

export interface Npc {
  id: string;
  kind: NpcKind;
  x: number;
  y: number;
  glyph: string;
  color: string;
  name: string;
  wander: boolean;
  rollerId?: string;
  /** What they'll say (patrons and pedestrians). */
  line?: string;
  /** A pickpocket who is right beside you and about to strike. */
  ready?: boolean;
  /** A paid tip they're holding. */
  tip?: Tip;
}

export interface Tip {
  text: string;
  price: number;
  /** A roller's tell that this reveals. */
  tell?: string;
}

export interface Area {
  id: string;
  name: string;
  kind: "strip" | "casino";
  casino?: CasinoDef;
  w: number;
  h: number;
  tiles: number[];
  /** Building or casino id for colored strip blocks, by tile index. */
  owner: Map<number, string>;
  tables: TableDef[];
  machines: MachineSpot[];
  videos: VideoSpot[];
  doors: DoorDef[];
  signs: Sign[];
  npcs: Npc[];
  /** Where you arrive. */
  entry: { x: number; y: number };
  vipDoor?: { x: number; y: number };
}

export function regionName(x: number, y: number, w: number, h: number): string {
  const ns = y < h / 2 ? "north" : "south";
  const ew = x < w / 3 ? "west" : x >= (w * 2) / 3 ? "east" : "";
  return ew ? `${ns}-${ew}` : ns;
}

function blankArea(id: string, name: string, kind: Area["kind"], fill: number): Area {
  return {
    id,
    name,
    kind,
    w: MAP_W,
    h: MAP_H,
    tiles: new Array(MAP_W * MAP_H).fill(fill),
    owner: new Map(),
    tables: [],
    machines: [],
    videos: [],
    doors: [],
    signs: [],
    npcs: [],
    entry: { x: 4, y: 8 },
  };
}

export const tileAt = (a: Area, x: number, y: number): number =>
  x < 0 || y < 0 || x >= a.w || y >= a.h ? T.wall : a.tiles[y * a.w + x];

function setTile(a: Area, x: number, y: number, t: number, owner?: string): void {
  if (x < 0 || y < 0 || x >= a.w || y >= a.h) return;
  a.tiles[y * a.w + x] = t;
  if (owner) a.owner.set(y * a.w + x, owner);
}

function rect(
  a: Area,
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  owner?: string,
): void {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) setTile(a, xx, yy, t, owner);
}

// ---------------------------------------------------------------------------------------------
// Ace Avenue

interface Building {
  id: CasinoId | ShopId;
  x: number;
  w: number;
  north: boolean;
}

const BUILDINGS: Building[] = [
  { id: "rustyspur", x: 1, w: 22, north: true },
  { id: "coralgrotto", x: 26, w: 22, north: true },
  { id: "starlight", x: 51, w: 22, north: true },
  { id: "motel", x: 1, w: 9, north: false },
  { id: "academy", x: 11, w: 11, north: false },
  { id: "charms", x: 23, w: 9, north: false },
  { id: "pawn", x: 33, w: 8, north: false },
  { id: "loans", x: 42, w: 7, north: false },
  { id: "velvetfox", x: 50, w: 11, north: false },
  { id: "pinnacle", x: 62, w: 11, north: false },
];

const SHORT_SIGN: Record<string, string> = {
  rustyspur: "RUSTY SPUR",
  coralgrotto: "CORAL GROTTO",
  starlight: "STARLIGHT",
  motel: "MOTEL",
  academy: "ACADEMY",
  charms: "CHARMS",
  pawn: "PAWN",
  loans: "LOANS",
  velvetfox: "VELVET FOX",
  pinnacle: "PINNACLE",
};

export function buildingColor(id: string): { wall: string; sign: string } {
  if (id in CASINOS) {
    const c = CASINOS[id as CasinoId];
    return { wall: c.theme.wall, sign: c.theme.sign };
  }
  const s = SHOPS[id as ShopId];
  return s ? { wall: s.wall, sign: s.color } : { wall: C.dim, sign: C.light };
}

export function buildStrip(): Area {
  const a = blankArea("strip", "Ace Avenue", "strip", T.road);
  rect(a, 0, 0, MAP_W, 7, T.wall);
  rect(a, 0, 7, MAP_W, 2, T.sidewalk);
  rect(a, 0, 15, MAP_W, 2, T.sidewalk);
  rect(a, 0, 17, MAP_W, 7, T.wall);
  for (let x = 1; x < MAP_W - 1; x += 3) {
    setTile(a, x, 12, T.lane);
    setTile(a, x + 1, 12, T.lane);
  }
  // The ends of the Avenue.
  for (let y = 7; y < 17; y++) {
    setTile(a, 0, y, T.wall);
    setTile(a, MAP_W - 1, y, T.wall);
  }
  for (const b of BUILDINGS) {
    const top = b.north ? 0 : 17;
    rect(a, b.x, top, b.w, 7, T.building, b.id);
    const doorX = b.x + Math.floor(b.w / 2);
    const doorY = b.north ? 6 : 17;
    setTile(a, doorX, doorY, T.door, b.id);
    a.doors.push({ x: doorX, y: doorY, target: b.id, outX: doorX, outY: b.north ? 7 : 16 });
    const text = SHORT_SIGN[b.id];
    a.signs.push({
      x: b.x + Math.floor((b.w - text.length) / 2),
      y: b.north ? 3 : 20,
      text,
      fg: buildingColor(b.id).sign,
    });
  }
  // Palms and street lamps along the sidewalks.
  for (let x = 4; x < MAP_W - 2; x += 8) {
    if (!a.doors.some((d) => Math.abs(d.x - x) <= 1)) setTile(a, x, 7, T.palm);
    if (!a.doors.some((d) => Math.abs(d.x - x - 3) <= 1)) setTile(a, x + 3, 16, T.lamp);
  }
  a.signs.push({ x: 2, y: 10, text: "WELCOME TO", fg: C.gray });
  a.signs.push({ x: 2, y: 11, text: "ACE AVENUE", fg: C.yellow });
  a.entry = { x: 3, y: 8 };
  return a;
}

/** Where you come out on the Avenue from a building. */
export function stripDoor(strip: Area, id: string): DoorDef {
  const d = strip.doors.find((door) => door.target === id);
  if (!d) throw new Error(`No door for ${id}`);
  return d;
}

// ---------------------------------------------------------------------------------------------
// Casino floors

const CELL_W = 10;
const CELL_H = 4;
const GRID_X0 = 2;
const GRID_Y0 = 8;
const GRID_COLS = 7;
const GRID_ROWS = 3;

type Station =
  | "blackjack"
  | "roulette"
  | "craps"
  | "baccarat"
  | "slots"
  | "video"
  | "duel"
  | "decor"
  | "empty";

/** Lays out one casino. The layout is fixed for the whole game (same seed, same floor). */
export function buildCasino(casino: CasinoDef, gameSeed: number): Area {
  const rng = new Rng(hashSeed(gameSeed, CASINO_ORDER.indexOf(casino.id) + 1, 777));
  const a = blankArea(casino.id, casino.name, "casino", T.floor);
  a.casino = casino;
  // Outer walls.
  rect(a, 0, 0, MAP_W, 1, T.wall);
  rect(a, 0, MAP_H - 1, MAP_W, 1, T.wall);
  rect(a, 0, 0, 1, MAP_H, T.wall);
  rect(a, MAP_W - 1, 0, 1, MAP_H, T.wall);

  // The VIP room, top middle.
  const vx0 = 28;
  const vx1 = 45;
  rect(a, vx0, 0, vx1 - vx0 + 1, 7, T.wall);
  rect(a, vx0 + 1, 1, vx1 - vx0 - 1, 5, T.vipFloor);
  const doorX = 36;
  setTile(a, doorX, 6, T.vipDoor);
  a.vipDoor = { x: doorX, y: 6 };
  const boss = casino.boss;
  const bossTable: TableDef = {
    id: "vip",
    kind: "duel",
    x: 33,
    y: 3,
    w: 8,
    h: 1,
    min: 0,
    max: 0,
    rollerId: boss.id,
    region: "VIP room",
    label: "VIP table",
  };
  rect(a, bossTable.x, bossTable.y, bossTable.w, bossTable.h, T.felt);
  a.tables.push(bossTable);
  a.signs.push({ x: 34, y: 1, text: "V I P", fg: casino.theme.accent });

  // Bar on one side, lounge on the other.
  const barLeft = rng.chance(0.5);
  const bx0 = barLeft ? 1 : MAP_W - 15;
  rect(a, bx0, 4, 14, 1, T.bar);
  const sideX = barLeft ? bx0 + 13 : bx0;
  for (let y = 1; y < 4; y++) setTile(a, sideX, y, T.bar);
  for (let x = bx0; x < bx0 + 14; x++) if (x !== sideX) setTile(a, x, 1, T.shelf);
  const bartenderX = bx0 + 6;
  const loungeX0 = barLeft ? 47 : 2;
  for (let i = 0; i < 6; i++) {
    const x = loungeX0 + rng.int(0, 24);
    const y = rng.int(1, 4);
    if (tileAt(a, x, y) === T.floor) setTile(a, x, y, rng.chance(0.6) ? T.plant : T.pillar);
  }

  // Lobby with the cashier cage and the way out.
  rect(a, 1, 20, MAP_W - 2, 3, T.lobby);
  rect(a, 2, 20, 8, 2, T.cage);
  rect(a, MAP_W - 10, 20, 8, 2, T.cage);
  a.signs.push({ x: 3, y: 20, text: "CASHIER", fg: C.gold });
  a.signs.push({ x: MAP_W - 9, y: 20, text: "CASHIER", fg: C.gold });
  setTile(a, 36, MAP_H - 1, T.exit);
  setTile(a, 37, MAP_H - 1, T.exit);
  a.entry = { x: 36, y: MAP_H - 2 };

  // The gaming floor: one station per grid cell.
  const stations: Station[] = [];
  const bjCount = rng.int(3, 4);
  for (let i = 0; i < bjCount; i++) stations.push("blackjack");
  if (casino.roulette) for (let i = rng.int(1, 2); i > 0; i--) stations.push("roulette");
  if (casino.craps) stations.push("craps");
  for (let i = rng.int(2, 3); i > 0; i--) stations.push("slots");
  stations.push("video");
  if (casino.baccarat) stations.push("baccarat");
  for (let i = 0; i < casino.rollers.length; i++) stations.push("duel");
  while (stations.length < GRID_COLS * GRID_ROWS)
    stations.push(rng.chance(0.4) ? "decor" : "empty");
  rng.shuffle(stations);

  let bjN = 0;
  let rouletteN = 0;
  let duelN = 0;
  let bankN = 0;
  let videoN = 0;
  stations.forEach((kind, i) => {
    const cx = GRID_X0 + (i % GRID_COLS) * CELL_W;
    const cy = GRID_Y0 + Math.floor(i / GRID_COLS) * CELL_H;
    const x = cx + 1 + rng.int(0, 1);
    const y = cy + 1;
    const region = regionName(x + 3, y, MAP_W, MAP_H);
    switch (kind) {
      case "blackjack": {
        const rules = { ...rng.pick(casino.bj.rules) };
        rect(a, x, y, 5, 2, T.felt);
        // A 6:5 table is cheaper to sit at.
        const cheap = rules.bjPays < 1.5;
        a.tables.push({
          id: `bj${bjN}`,
          kind: "blackjack",
          x,
          y,
          w: 5,
          h: 2,
          min: cheap ? Math.max(1, Math.floor(casino.bj.min / 2)) : casino.bj.min,
          max: casino.bj.max,
          rules,
          region,
          label: `Blackjack ${++bjN}`,
        });
        break;
      }
      case "roulette": {
        const r = casino.roulette as NonNullable<CasinoDef["roulette"]>;
        rect(a, x, y, 6, 2, T.felt);
        setTile(a, x, y, T.wheel);
        setTile(a, x, y + 1, T.wheel);
        a.tables.push({
          id: `rl${rouletteN}`,
          kind: "roulette",
          x,
          y,
          w: 6,
          h: 2,
          min: r.min,
          max: r.max,
          wheel: makeWheel(rng, r.doubleZero, casino.biasChance),
          region,
          label: `Roulette ${++rouletteN}`,
        });
        break;
      }
      case "craps": {
        const c = casino.craps as NonNullable<CasinoDef["craps"]>;
        rect(a, x, y, 7, 2, T.felt);
        a.tables.push({
          id: "craps",
          kind: "craps",
          x,
          y,
          w: 7,
          h: 2,
          min: c.min,
          max: c.max,
          region,
          label: "Craps",
        });
        break;
      }
      case "slots": {
        const bank = `${region} bank`;
        bankN++;
        for (let k = 0; k < 6; k++) {
          setTile(a, x + k, y, T.machine);
          a.machines.push({
            id: `m${bankN}-${k}`,
            x: x + k,
            y,
            def: makeMachine(rng, casino.looseChance),
            coin: casino.slotCoin,
            region: bank,
            n: k + 1,
          });
        }
        break;
      }
      case "duel": {
        const roller = casino.rollers[duelN++];
        rect(a, x, y, 4, 2, T.felt);
        a.tables.push({
          id: `duel${duelN}`,
          kind: "duel",
          x,
          y,
          w: 4,
          h: 2,
          min: 0,
          max: 0,
          rollerId: roller.id,
          region,
          label: `${roller.short}'s table`,
        });
        break;
      }
      case "baccarat": {
        const b = casino.baccarat as NonNullable<CasinoDef["baccarat"]>;
        rect(a, x, y, 6, 2, T.felt);
        a.tables.push({
          id: "baccarat",
          kind: "baccarat",
          x,
          y,
          w: 6,
          h: 2,
          min: b.min,
          max: b.max,
          region,
          label: "Baccarat",
        });
        break;
      }
      case "video": {
        videoN++;
        for (let k = 0; k < 4; k++) {
          setTile(a, x + k, y, T.video);
          a.videos.push({
            id: `v${videoN}-${k}`,
            x: x + k,
            y,
            table: rng.pick(casino.video.tables),
            coin: casino.video.coin,
            region: `${region} video poker bank`,
            n: k + 1,
          });
        }
        break;
      }
      case "decor":
        setTile(a, cx + rng.int(2, 7), cy + rng.int(1, 2), rng.chance(0.5) ? T.plant : T.pillar);
        break;
      case "empty":
        break;
    }
  });

  // People who are always there: the high rollers, the boss and the bartender.
  for (const t of a.tables) {
    if (t.kind !== "duel" || !t.rollerId) continue;
    const r = casino.rollers.find((ro) => ro.id === t.rollerId) ?? boss;
    const at = t.id === "vip" ? { x: 36, y: 2 } : { x: t.x + t.w, y: t.y };
    a.npcs.push({
      id: r.id,
      kind: "roller",
      x: at.x,
      y: at.y,
      glyph: r.glyph,
      color: r.color,
      name: r.name,
      wander: false,
      rollerId: r.id,
    });
  }
  a.npcs.push({
    id: "bartender",
    kind: "bartender",
    x: bartenderX,
    y: 2,
    glyph: "☺",
    color: C.tan,
    name: "the bartender",
    wander: false,
  });
  return a;
}

/** Squares you can reach on foot from the entry (ignores people). */
export function reachable(a: Area, from = a.entry, openVip = true): Set<number> {
  const seen = new Set<number>([from.y * a.w + from.x]);
  const queue = [from];
  while (queue.length) {
    const p = queue.shift() as { x: number; y: number };
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = p.x + dx;
        const y = p.y + dy;
        const i = y * a.w + x;
        if (seen.has(i)) continue;
        const t = tileAt(a, x, y);
        if (!walkable(t) && !(openVip && t === T.vipDoor)) continue;
        seen.add(i);
        queue.push({ x, y });
      }
  }
  return seen;
}

/** Free floor squares (for placing people). */
export function openSquares(a: Area, kinds: number[] = [T.floor]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < a.h; y++)
    for (let x = 0; x < a.w; x++) if (kinds.includes(tileAt(a, x, y))) out.push({ x, y });
  return out;
}
