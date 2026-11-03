import { rulesText } from "../../../game/blackjack";
import { C } from "../../../game/colors";
import { CASINO_ORDER, CASINOS, ROLLER_BY_ID } from "../../../game/data/casinos";
import { DRINKS, ITEMS, SKILL_ORDER, SKILLS } from "../../../game/data/items";
import { SHOPS, type ShopId } from "../../../game/data/shops";
import { type Game, HEAT_MAX, type Interaction, money } from "../../../game/game";
import { buildingColor, MAP_H, MAP_W, type Npc, T, tileAt } from "../../../game/world";
import type { App, Screen } from "../app";
import { ACTION_DIR, actionFor } from "../settings";
import { COLS, ROWS, type Term } from "../term";
import { BaccaratScreen } from "./baccarat";
import { BlackjackScreen } from "./blackjack";
import { ClubScreen } from "./club";
import { CrapsScreen } from "./craps";
import { meter, wrapLines } from "./draw";
import { EndScreen, HelpScreen, LogScreen, PauseScreen, SheetScreen } from "./menus";
import { RouletteScreen } from "./roulette";
import { ShopScreen } from "./shop";
import { SlotsScreen } from "./slots";
import { BarScreen, RollerScreen, TalkScreen } from "./talk";
import { VideoPokerScreen } from "./videopoker";

const MAP_X = 1;
const MAP_Y = 1;
const PANEL_X = MAP_X + MAP_W + 2;
const PANEL_W = COLS - PANEL_X - 1;
const LOG_Y = MAP_Y + MAP_H + 1;

/** Walking around the Avenue and the casino floors. */
export class PlayScreen implements Screen {
  readonly playing = true;
  readonly opaque = true;
  private hoverCell: { x: number; y: number } | null = null;
  private lastArea = "";
  private ended = false;

  constructor(private app: App) {
    this.lastArea = this.game.area.id;
  }

  get game(): Game {
    return this.app.game as Game;
  }

  key(e: KeyboardEvent): void {
    const g = this.game;
    if (g.s.over) {
      this.checkEnd();
      return;
    }
    const action = actionFor(e.code);
    if (!action) return;
    const dir = ACTION_DIR[action];
    if (dir) {
      this.open(g.move(dir[0], dir[1]));
    } else if (action === "wait") g.wait();
    else if (action === "sheet") this.app.push(new SheetScreen(this.app));
    else if (action === "log") this.app.push(new LogScreen(this.app));
    else if (action === "help") this.app.push(new HelpScreen(this.app));
    else if (action === "menu") this.app.push(new PauseScreen(this.app));
    this.after();
  }

  /** Call after anything happens: saves on area changes, checks for the end. */
  after(): void {
    const g = this.game;
    if (g.area.id !== this.lastArea) {
      this.lastArea = g.area.id;
      void this.app.save();
    } else this.app.autosave();
    this.checkEnd();
  }

  private checkEnd(): void {
    const g = this.game;
    if (g.s.over && !this.ended) {
      this.ended = true;
      this.app.push(new EndScreen(this.app, g.s.over));
    }
  }

  /** Opens the screen for whatever you bumped into. */
  open(it: Interaction | null): void {
    if (!it) return;
    const app = this.app;
    const g = this.game;
    switch (it.kind) {
      case "talk":
        if (it.npc.kind === "roller" && it.npc.rollerId)
          app.push(new RollerScreen(app, this, ROLLER_BY_ID[it.npc.rollerId]));
        else if (it.npc.kind === "rival") app.push(new RollerScreen(app, this, g.rivalDef()));
        else app.push(new TalkScreen(app, it.npc));
        break;
      case "bar":
        app.push(new BarScreen(app));
        break;
      case "shop":
        if (it.id === "pawn") g.s.visits.pawn = (g.s.visits.pawn ?? 0) + 1;
        app.push(new ShopScreen(app, it.id));
        break;
      case "machine":
        app.push(new SlotsScreen(app, this, it.machine));
        break;
      case "table":
        if (it.table.kind === "blackjack") app.push(new BlackjackScreen(app, this, it.table));
        else if (it.table.kind === "roulette") app.push(new RouletteScreen(app, this, it.table));
        else if (it.table.kind === "craps") app.push(new CrapsScreen(app, this, it.table));
        else if (it.table.kind === "baccarat") app.push(new BaccaratScreen(app, this, it.table));
        break;
      case "video":
        app.push(new VideoPokerScreen(app, this, it.spot));
        break;
      case "club":
        app.push(new ClubScreen(app));
        break;
    }
  }

  hover(cell: { x: number; y: number } | null): void {
    this.hoverCell = cell;
  }

  animating(): boolean {
    // Slot machine lights twinkle.
    return this.game.area.kind === "casino";
  }

  draw(t: Term, now: number): void {
    this.drawMap(t, now);
    this.drawPanel(t);
    this.drawLog(t);
  }

  private drawMap(t: Term, now: number): void {
    const g = this.game;
    const a = g.area;
    const c = a.casino;
    const blink = Math.floor(now / 350);
    const vipOpen = g.vipOpen();
    for (let y = 0; y < a.h; y++)
      for (let x = 0; x < a.w; x++) {
        const tile = tileAt(a, x, y);
        const sx = MAP_X + x;
        const sy = MAP_Y + y;
        let ch = " ";
        let fg: string = C.light;
        let bg: string = C.black;
        switch (tile) {
          case T.floor:
            bg = c ? c.theme.carpet[(x + y) % 2] : C.dark;
            if ((x * 3 + y * 5) % 7 === 0) {
              ch = "·";
              fg = c ? c.theme.carpetFg : C.dim;
            }
            break;
          case T.wall:
            bg = c ? c.theme.wall : C.dark;
            ch = c && (y === 0 || y === a.h - 1) && x % 4 === 0 ? "▪" : " ";
            fg = c ? c.theme.wallFg : C.dim;
            break;
          case T.felt: {
            bg = c ? c.theme.felt : C.felt;
            const table = g.tableAt(x, y);
            if (table) {
              const lx = x - table.x;
              const ly = y - table.y;
              if (table.kind === "blackjack") {
                if (ly === 0 && lx === 2) {
                  ch = "d";
                  fg = g.hotTable === table.id ? (blink % 2 ? C.gold : C.yellow) : C.white;
                } else if (ly === 1) {
                  ch = "◦";
                  fg = C.paper;
                }
              } else if (table.kind === "roulette") {
                ch = "▪";
                fg = (lx + ly) % 2 ? C.red : C.black;
              } else if (table.kind === "craps") {
                ch = lx === 3 ? "⁞" : ly === 0 ? "~" : "•";
                fg = lx === 3 ? C.white : C.paper;
              } else if (table.kind === "baccarat") {
                ch = ly === 0 ? (lx === 2 || lx === 3 ? "d" : "~") : ("PBTTBP"[lx] ?? "·");
                fg =
                  ly === 0
                    ? lx === 2 || lx === 3
                      ? C.white
                      : C.paper
                    : lx === 2 || lx === 3
                      ? C.gold
                      : C.paper;
              } else if (table.kind === "duel") {
                ch = "♠♥♦♣"[(lx + ly) % 4];
                fg = (lx + ly) % 4 === 1 || (lx + ly) % 4 === 2 ? C.red : C.black;
                if (table.id === "vip") fg = c?.theme.accent ?? C.gold;
              }
            }
            break;
          }
          case T.wheel:
            bg = c ? c.theme.felt : C.felt;
            ch = "◎";
            fg = (blink + y) % 2 ? C.gold : C.amber;
            break;
          case T.video:
            bg = "#0c1a3a";
            ch = "▣";
            fg = (x + blink) % 6 === 0 ? C.white : C.cyan;
            break;
          case T.machine: {
            bg = "#2a0a24";
            const lit = (x * 7 + blink) % 5;
            ch = "$";
            fg = [C.yellow, C.magenta, C.cyan, C.lime, C.orange][lit];
            break;
          }
          case T.bar:
            bg = C.darkWood;
            ch = "═";
            fg = C.wood;
            break;
          case T.shelf:
            bg = C.night;
            ch = "¡!ïí"[x % 4];
            fg = [C.amber, C.green, C.red, C.cyan][(x * 3) % 4];
            break;
          case T.exit:
            bg = C.night;
            ch = "▼";
            fg = c?.theme.accent ?? C.yellow;
            break;
          case T.vipDoor:
            bg = vipOpen ? "#3a0a14" : C.wine;
            ch = vipOpen ? "·" : "▒";
            fg = vipOpen ? C.gold : C.red;
            break;
          case T.vipFloor:
            bg = "#3a0a14";
            if ((x + y) % 3 === 0) {
              ch = "·";
              fg = C.darkGold;
            }
            break;
          case T.plant:
            bg = c ? c.theme.carpet[(x + y) % 2] : C.dark;
            ch = "♣";
            fg = C.green;
            break;
          case T.pillar:
            bg = c ? c.theme.carpet[(x + y) % 2] : C.dark;
            ch = "■";
            fg = c ? c.theme.wallFg : C.steel;
            break;
          case T.cage:
            bg = "#1a1a10";
            ch = "║";
            fg = C.darkGold;
            break;
          case T.lobby:
            bg = (x + y) % 2 ? "#202028" : "#1c1c24";
            break;
          case T.road:
            bg = C.asphalt;
            break;
          case T.lane:
            bg = C.asphalt;
            ch = "─";
            fg = C.yellow;
            break;
          case T.sidewalk:
            bg = "#33343e";
            if ((x + y) % 4 === 0) {
              ch = "·";
              fg = C.dim;
            }
            break;
          case T.building: {
            const owner = a.owner.get(y * a.w + x) ?? "";
            const col = buildingColor(owner);
            bg = col.wall;
            if (x % 3 === 1 && y % 2 === 1 && y !== 3 && y !== 20) {
              ch = "▪";
              fg = (x * 5 + y * 3 + Math.floor(now / 4000)) % 6 === 0 ? C.yellow : C.dim;
            }
            break;
          }
          case T.door: {
            const door = a.doors.find((d) => d.x === x && d.y === y);
            const id = door?.target ?? "";
            const locked =
              id in CASINOS &&
              CASINOS[id as keyof typeof CASINOS].tier > 1 &&
              !g.s.chips.includes(CASINO_ORDER[CASINOS[id as keyof typeof CASINOS].tier - 2]);
            bg = C.black;
            ch = locked ? "≡" : "▒";
            fg = locked ? C.red : buildingColor(id).sign;
            break;
          }
          case T.palm:
            bg = "#33343e";
            ch = "¥";
            fg = C.green;
            break;
          case T.lamp:
            bg = "#33343e";
            ch = "¡";
            fg = C.amber;
            break;
        }
        t.put(sx, sy, ch, fg, bg);
      }
    for (const s of a.signs)
      for (let i = 0; i < s.text.length; i++)
        if (s.text[i] !== " ") t.put(MAP_X + s.x + i, MAP_Y + s.y, s.text[i], s.fg);
    for (const n of a.npcs) {
      const sx = MAP_X + n.x;
      const sy = MAP_Y + n.y;
      if (n.kind === "roller") {
        const beaten = g.beaten(n.id);
        t.put(sx, sy, n.glyph, beaten ? C.gray : n.color, beaten ? undefined : C.darkGold);
      } else if (n.kind === "rival") t.put(sx, sy, n.glyph, n.color, C.wine);
      else t.put(sx, sy, n.glyph, n.tip ? C.white : n.color);
    }
    t.put(MAP_X + g.s.x, MAP_Y + g.s.y, "@", C.yellow);
  }

  /** Words for whatever is under the mouse. */
  private describe(x: number, y: number): string {
    const g = this.game;
    const a = g.area;
    if (x === g.s.x && y === g.s.y) return "You.";
    const npc = g.npcAt(x, y);
    if (npc) return describeNpc(g, npc);
    const table = g.tableAt(x, y);
    if (table) {
      if (table.kind === "duel" && table.rollerId) {
        const r = ROLLER_BY_ID[table.rollerId];
        return `${r.name}'s private table (${r.game}, ${money(r.stake)} stake).`;
      }
      const limits = `${money(table.min)}-${money(table.max)}`;
      if (table.kind === "blackjack" && table.rules)
        return `${table.label}: ${limits}. ${rulesText(table.rules)}.`;
      if (table.kind === "roulette")
        return `${table.label}: ${limits}. ${table.wheel?.doubleZero ? "Double zero" : "Single zero"} wheel.`;
      if (table.kind === "baccarat") return `Baccarat: ${limits}. Bet Player, Banker or Tie.`;
      return `Craps: ${limits}.`;
    }
    const v = a.videos.find((vs) => vs.x === x && vs.y === y);
    if (v)
      return `Video poker (Jacks or Better), ${v.region}: ${money(v.coin)} a coin. Pay table ${v.table} on the glass.`;
    const m = g.machineAt(x, y);
    if (m) {
      const sense = g.skill("slots");
      const feel =
        sense >= 2
          ? ` Payback ${(m.def.rtp * 100).toFixed(1)}%.`
          : sense >= 1
            ? ` It feels ${m.def.looseness === "fair" ? "ordinary" : m.def.looseness}.`
            : "";
      return `Slot machine ${m.n}, ${m.region}: ${money(m.coin)} a coin.${feel}`;
    }
    const tile = tileAt(a, x, y);
    if (tile === T.door) {
      const d = a.doors.find((dd) => dd.x === x && dd.y === y);
      if (!d) return "";
      if (d.target in CASINOS) {
        const cdef = CASINOS[d.target as keyof typeof CASINOS];
        return `${cdef.name} - ${cdef.blurb}`;
      }
      return SHOPS[d.target as ShopId].name;
    }
    const names: Partial<Record<number, string>> = {
      [T.bar]: "The bar. Walk into it for a drink.",
      [T.exit]: "The way out to the Avenue.",
      [T.vipDoor]: g.vipOpen()
        ? "The VIP room. Open to you."
        : "The VIP room. Beat the high rollers first.",
      [T.cage]: "The cashier's cage: the Players' Club desk. Trade comp points for perks.",
      [T.plant]: "A potted palm.",
      [T.palm]: "A palm tree.",
      [T.lamp]: "A street lamp.",
      [T.shelf]: "Bottles behind the bar.",
    };
    return names[tile] ?? "";
  }

  private drawPanel(t: Term): void {
    const g = this.game;
    const s = g.s;
    const x = PANEL_X;
    let y = MAP_Y;
    const clock = g.clock();
    t.text(x, y++, s.name, C.yellow);
    t.text(x, y, "Cash ", C.gray);
    t.text(x + 5, y++, money(s.cash), s.cash < 50 ? C.red : C.lime);
    if (s.debt > 0) {
      const left = s.debtDue - s.turn;
      t.text(x, y++, `Owe Vinnie ${money(s.debt)}`, C.red);
      t.text(x, y++, left > 0 ? `  due in ${left} turns` : "  OVERDUE", left > 50 ? C.gray : C.red);
    }
    t.text(x, y++, `Day ${clock.day}, ${clock.time}`, C.gray);
    y++;
    const c = g.casino;
    if (c) {
      t.text(x, y++, c.name, c.theme.accent);
      const heat = g.heatHere();
      t.text(x, y, "Heat ", C.gray);
      meter(t, x + 5, y, 16, heat / HEAT_MAX, heat >= 70 ? C.red : heat >= 40 ? C.orange : C.amber);
      t.text(x + 22, y++, String(heat), heat >= 70 ? C.red : C.light);
      y++;
      t.text(x, y++, "High rollers", C.light);
      for (const r of [...c.rollers, c.boss]) {
        const done = g.beaten(r.id);
        const mark = done ? "✓" : r.boss ? "★" : "·";
        t.put(x, y, mark, done ? C.green : r.boss ? C.gold : C.gray);
        t.text(x + 2, y, r.short, done ? C.gray : r.color, undefined, x + 16);
        t.text(x + 17, y, r.game === "poker" ? "poker" : "21", C.dim);
        t.text(x + 23, y++, money(r.stake), done ? C.dim : s.cash >= r.stake ? C.lime : C.gray);
      }
    } else {
      t.text(x, y++, "Ace Avenue", C.yellow);
      const hot = CASINO_ORDER.filter((id) => g.heatIn(id) > 0);
      if (hot.length) {
        for (const id of hot.slice(0, 3)) {
          t.text(x, y, CASINOS[id].name.replace("The ", "").slice(0, 13), C.gray);
          meter(t, x + 14, y, 10, g.heatIn(id) / HEAT_MAX, s.banned[id] ? C.red : C.amber);
          t.text(x + 25, y++, String(g.heatIn(id)), s.banned[id] ? C.red : C.light);
        }
      } else t.text(x, y++, "No heat anywhere.", C.dim);
      y += 4 - Math.min(3, hot.length);
    }
    y++;
    t.text(x, y, "Club pts ", C.gray);
    t.text(x + 9, y++, String(Math.floor(s.comps)), C.gold);
    t.text(x, y, "Chips ", C.gray);
    CASINO_ORDER.forEach((id, i) => {
      const has = s.chips.includes(id);
      t.put(x + 6 + i * 2, y, has ? "●" : "○", has ? CASINOS[id].theme.accent : C.dim);
    });
    y += 2;
    t.text(x, y++, "Skills", C.light);
    for (const id of SKILL_ORDER) {
      const v = g.skill(id);
      if (v === 0 && s.skills[id] === 0) continue;
      t.text(x + 1, y, SKILLS[id].name, C.gray);
      t.text(
        x + 14,
        y++,
        "■".repeat(v) + "□".repeat(SKILLS[id].max - v),
        v > s.skills[id] ? C.cyan : C.yellow,
      );
    }
    if (SKILL_ORDER.every((id) => g.skill(id) === 0))
      t.text(x + 1, y++, "None yet (Academy)", C.dim);
    if (s.buffs.length) {
      for (const b of s.buffs.slice(0, 2))
        t.text(
          x + 1,
          y++,
          `${DRINKS[b.id].name} ${b.until - s.turn}`,
          C.cyan,
          undefined,
          x + PANEL_W,
        );
    }
    y++;
    t.text(x, y, "Pockets ", C.gray);
    s.pockets.forEach((id, i) => {
      t.put(x + 8 + i * 2, y, ITEMS[id].glyph, ITEMS[id].color);
    });
    if (!s.pockets.length) t.text(x + 8, y, "empty", C.dim);
    y += 2;
    // What's under the mouse.
    const h = this.hoverCell;
    if (h) {
      const mx = h.x - MAP_X;
      const my = h.y - MAP_Y;
      if (mx >= 0 && my >= 0 && mx < MAP_W && my < MAP_H) {
        const lines = wrapLines(this.describe(mx, my), PANEL_W);
        lines.slice(0, MAP_Y + MAP_H - y).forEach((l, i) => t.text(x, y + i, l, C.white));
      }
    }
  }

  private drawLog(t: Term): void {
    const g = this.game;
    for (let x = 0; x < COLS; x++) t.put(x, LOG_Y - 1, "─", C.dim);
    const lines: { text: string; color: string }[] = [];
    for (const l of g.s.log.slice(-12))
      for (const w of wrapLines(l.text, COLS - 2)) lines.push({ text: w, color: l.color });
    const shown = lines.slice(-(ROWS - LOG_Y - 1));
    shown.forEach((l, i) => {
      const old = i < shown.length - 4;
      t.text(1, LOG_Y + i, l.text, old ? C.gray : l.color);
    });
    t.text(
      1,
      ROWS - 1,
      "Move: arrows/QWEADZXC  Wait: S  Sheet: I  Log: M  Help: ?  Menu: Esc",
      C.dim,
    );
  }
}

export function describeNpc(g: Game, n: Npc): string {
  switch (n.kind) {
    case "roller": {
      const r = ROLLER_BY_ID[n.rollerId ?? ""];
      return `${r.name}, ${r.title}. ${g.beaten(r.id) ? "Beaten." : `Plays ${r.game} for ${money(r.stake)}.`}`;
    }
    case "patron":
      return n.tip ? "A gambler who looks like they know something." : "A gambler.";
    case "waitress":
      return "A cocktail waitress. Walk into her for a drink.";
    case "pitboss":
      return "The pit boss. Heat builds twice as fast at tables he's watching.";
    case "security":
      return "Casino security.";
    case "bartender":
      return "The bartender.";
    case "pedestrian":
      return "Someone strolling down the Avenue.";
    case "collector":
      return "Knuckles, Vinnie's debt collector.";
    case "millionaire":
      return "A tipsy millionaire looking for someone to gamble with.";
    case "pickpocket":
      return g.skill("charm") >= 2 ? "A shifty-eyed gambler. Watch your wallet." : "A gambler.";
    case "rival":
      return `"Dutch" Calloway, your rival. You've beaten him ${g.s.rival.wins} time${g.s.rival.wins === 1 ? "" : "s"}.`;
  }
}
