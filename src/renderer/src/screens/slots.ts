import { C } from "../../../game/colors";
import { ITEMS } from "../../../game/data/items";
import { type Game, money } from "../../../game/game";
import {
  centerLine,
  JACKPOT_MAX_BET,
  linePays,
  MAX_COINS,
  ONE_CHERRY,
  type SlotSymbol,
  spinReels,
  symbolAt,
  THREE_PAYS,
  TWO_CHERRY,
} from "../../../game/slots";
import type { MachineSpot } from "../../../game/world";
import type { App, Screen } from "../app";
import { animMs } from "../settings";
import { COLS, ROWS, type Term } from "../term";
import { felt } from "./draw";
import { NoticeScreen } from "./menus";
import type { PlayScreen } from "./play";

const ART: Record<SlotSymbol, [string[], string]> = {
  blank: [["         ", "    -    ", "         "], C.dim],
  cherry: [["   _/\\_  ", "  ●   ●  ", "         "], C.red],
  plum: [["   ▄█▄   ", "  █████  ", "   ▀█▀   "], C.purple],
  bell: [["   ▄█▄   ", "  █████  ", " ▀▀▀●▀▀▀ "], C.gold],
  bar: [[" ▄▄▄▄▄▄▄ ", " █ BAR █ ", " ▀▀▀▀▀▀▀ "], C.white],
  seven: [[" ▀▀▀▀▀█  ", "    ▄▀   ", "   █     "], C.red],
};

const REEL_W = 11;
const MX = 22;
const MY = 6;

/** One slot machine. */
export class SlotsScreen implements Screen {
  readonly opaque = true;
  private coins = 1;
  private stops: number[];
  private spinStart = 0;
  private spinning = false;
  private message = "";
  private messageColor: string = C.white;
  private lastPay = 0;
  private nudge: { reel: number; dir: number } | null = null;

  constructor(
    private app: App,
    private play: PlayScreen,
    private m: MachineSpot,
  ) {
    this.stops = m.def.reels.map((r, i) => (i * 7) % r.length);
    this.message = `${money(m.coin)} a coin. Up to ${MAX_COINS} coins a pull.`;
  }

  get game(): Game {
    return this.app.game as Game;
  }

  private pull(): void {
    const g = this.game;
    const cost = this.coins * this.m.coin;
    if (!g.pay(cost)) {
      this.message = "You don't have enough cash.";
      this.messageColor = C.orange;
      g.sound("deny");
      return;
    }
    this.stops = spinReels(this.m.def, g.rng);
    this.spinning = true;
    this.spinStart = performance.now();
    this.nudge = null;
    this.message = "";
    g.sound("tick");
  }

  private reelStop(i: number): number {
    return animMs(700 + i * 420);
  }

  private settle(): void {
    const g = this.game;
    this.spinning = false;
    const line = centerLine(this.m.def, this.stops);
    const pays = linePays(line, this.coins) * this.coins * this.m.coin;
    this.lastPay = pays;
    const cost = this.coins * this.m.coin;
    g.receive(pays);
    const jackpot = line.every((s) => s === "seven");
    this.report(pays, jackpot);
    if (pays === 0 && g.has("rabbitfoot")) this.nudge = { reel: 1, dir: 1 };
    const out = g.houseResult({
      table: this.m,
      bet: cost,
      net: pays - cost,
      min: this.m.coin,
      jackpot,
    });
    if (out) {
      this.app.popTo(this.play);
      this.app.push(
        new NoticeScreen(
          this.app,
          "SHOWN THE DOOR",
          ["Security walked you out of the casino.", "Your heat there needs to cool off."],
          C.red,
        ),
      );
      this.play.after();
    } else if (g.s.over) this.leave();
  }

  private report(pays: number, jackpot: boolean): void {
    const g = this.game;
    if (jackpot) {
      this.message = `JACKPOT! ${money(pays)}!`;
      this.messageColor = C.gold;
      g.sound("jackpot");
    } else if (pays > 0) {
      this.message = `You win ${money(pays)}.`;
      this.messageColor = C.lime;
      g.sound(pays >= this.coins * this.m.coin * 10 ? "bigwin" : "coin");
    } else {
      this.message = "No luck.";
      this.messageColor = C.gray;
    }
  }

  /** The Rabbit's Foot: shift one reel a stop after a losing pull. */
  private applyNudge(): void {
    const g = this.game;
    const n = this.nudge;
    if (!n || !g.useItem("rabbitfoot")) return;
    this.stops[n.reel] += n.dir;
    this.nudge = null;
    const line = centerLine(this.m.def, this.stops);
    const pays = linePays(line, this.coins) * this.coins * this.m.coin;
    g.receive(pays);
    this.lastPay = pays;
    g.log("You rub your Rabbit's Foot and give a reel a nudge.", C.green);
    this.report(
      pays,
      line.every((s) => s === "seven"),
    );
    if (pays === 0) this.message = "You nudge the reel with your Rabbit's Foot... still nothing.";
  }

  private leave(): void {
    this.app.pop();
    this.play.after();
  }

  key(e: KeyboardEvent): void {
    if (this.spinning) return;
    const code = e.code;
    if (this.nudge) {
      if (code === "ArrowLeft") this.nudge.reel = (this.nudge.reel + 2) % 3;
      else if (code === "ArrowRight") this.nudge.reel = (this.nudge.reel + 1) % 3;
      else if (code === "ArrowUp") this.nudge.dir = -1;
      else if (code === "ArrowDown") this.nudge.dir = 1;
      else if (code === "Enter" || code === "NumpadEnter" || code === "KeyN") this.applyNudge();
      else if (code === "Escape" || code === "Backspace") this.nudge = null;
      return;
    }
    if (code === "Escape" || code === "Backspace") {
      this.leave();
      return;
    }
    if (code === "ArrowUp" || code === "ArrowRight")
      this.coins = Math.min(MAX_COINS, this.coins + 1);
    else if (code === "ArrowDown" || code === "ArrowLeft") this.coins = Math.max(1, this.coins - 1);
    else if (/^Digit[1-3]$/.test(code)) this.coins = Number(code.slice(5));
    else if (code === "KeyM") {
      this.coins = MAX_COINS;
      this.pull();
    } else if (code === "Enter" || code === "NumpadEnter" || code === "Space" || code === "KeyR")
      this.pull();
  }

  animating(now: number): boolean {
    if (!this.spinning) return false;
    if (now - this.spinStart >= this.reelStop(2) + animMs(150)) this.settle();
    return true;
  }

  draw(t: Term, now: number): void {
    const g = this.game;
    const m = this.m;
    felt(t, 0, 0, COLS, ROWS, C.black);
    t.center(
      0,
      `SLOT MACHINE  ·  ${m.region}, machine ${m.n}  ·  ${g.casino?.name ?? ""}`,
      C.yellow,
    );
    t.center(
      1,
      `${money(m.coin)} a coin  ·  1-${MAX_COINS} coins a pull  ·  Three 7s on ${MAX_COINS} coins pays ${JACKPOT_MAX_BET} a coin`,
      C.gray,
    );

    // Cabinet.
    const cw = REEL_W * 3 + 6;
    const lights = Math.floor(now / 200);
    for (let y = MY - 2; y < MY + 16; y++)
      for (let x = MX - 2; x < MX + cw - 2; x++) {
        const edge = y === MY - 2 || y === MY + 15 || x === MX - 2 || x === MX + cw - 3;
        const bulb = edge && (x + y + lights) % 4 === 0;
        t.put(x, y, edge ? "●" : " ", bulb ? C.yellow : C.darkGold, "#3a0a24");
      }
    t.text(MX + Math.floor((cw - 16) / 2) - 2, MY - 1, "★ LUCKY  SEVENS ★", C.gold, "#3a0a24");

    // Reels.
    for (let i = 0; i < 3; i++) {
      const rx = MX + i * (REEL_W + 1);
      let stop = this.stops[i];
      const elapsed = now - this.spinStart;
      if (this.spinning && elapsed < this.reelStop(i))
        stop = this.stops[i] + Math.floor((this.reelStop(i) - elapsed) / 45);
      for (let row = -1; row <= 1; row++) {
        const sym = symbolAt(m.def.reels[i], stop + row);
        const [art, color] = ART[sym];
        const y = MY + 1 + (row + 1) * 4;
        const center = row === 0;
        const bg = center ? C.paper : "#d8d2c4";
        t.fill(rx, y - 1, REEL_W, 4, " ", C.black, bg);
        art.forEach((line, k) => {
          t.text(rx + 1, y + k, line, sym === "blank" ? C.gray : color, bg);
        });
      }
      if (this.nudge?.reel === i) {
        t.text(rx + 3, MY + 14, this.nudge.dir < 0 ? "▲ up" : "▼ down", C.green, "#3a0a24");
      }
    }
    // Pay line.
    t.put(MX - 1, MY + 6, "►", C.red, "#3a0a24");
    t.put(MX + 3 * (REEL_W + 1) - 1, MY + 6, "◄", C.red, "#3a0a24");

    // Controls.
    const by = 24;
    t.text(MX, by, "Coins: ", C.light);
    for (let c = 1; c <= MAX_COINS; c++)
      t.text(
        MX + 7 + (c - 1) * 4,
        by,
        ` ${c} `,
        c === this.coins ? C.black : C.gray,
        c === this.coins ? C.yellow : C.dark,
      );
    t.text(MX + 20, by, `Bet ${money(this.coins * m.coin)}`, C.yellow);
    t.text(MX, by + 1, "↑↓ or 1-3 coins   Enter pull   M max bet   Esc leave", C.dim);
    if (this.nudge)
      t.text(
        MX,
        by + 3,
        `Rabbit's Foot: ←→ pick a reel, ↑↓ direction, Enter to nudge, Esc to keep the result.`,
        C.green,
        undefined,
        COLS - 2,
      );
    t.text(MX, by + 5, this.message, this.messageColor);

    // Pay table.
    const px = 74;
    let py = 4;
    t.text(px, py++, "PAYS (per coin)", C.gold);
    py++;
    const rows: [SlotSymbol, string][] = [
      ["seven", `7 7 7      ${THREE_PAYS.seven}  (${JACKPOT_MAX_BET} on ${MAX_COINS} coins)`],
      ["bar", `BAR x3     ${THREE_PAYS.bar}`],
      ["bell", `BELL x3    ${THREE_PAYS.bell}`],
      ["plum", `PLUM x3    ${THREE_PAYS.plum}`],
      ["cherry", `CHERRY x3  ${THREE_PAYS.cherry}`],
      ["cherry", `Any 2 cherries  ${TWO_CHERRY}`],
      ["cherry", `Any 1 cherry    ${ONE_CHERRY}`],
    ];
    for (const [sym, text] of rows) t.text(px, py++, text, ART[sym][1], undefined, COLS - 1);
    py += 2;
    t.text(px, py++, `Cash ${money(g.s.cash)}`, C.lime);
    if (this.lastPay > 0 && !this.spinning)
      t.text(px, py++, `Last pull paid ${money(this.lastPay)}`, C.yellow);
    t.text(px, py++, `Heat ${g.heatHere()}`, g.heatHere() >= 70 ? C.red : C.light);
    py++;
    const sense = g.skill("slots");
    if (sense >= 2)
      t.text(
        px,
        py++,
        `Slot Sense: pays back ${(m.def.rtp * 100).toFixed(1)}%`,
        m.def.rtp >= 1 ? C.lime : C.cyan,
      );
    else if (sense >= 1)
      t.text(
        px,
        py++,
        `Slot Sense: this one feels ${m.def.looseness === "fair" ? "ordinary" : m.def.looseness}.`,
        m.def.looseness === "loose" ? C.lime : C.cyan,
      );
    if (g.has("rabbitfoot"))
      t.text(
        px,
        py++,
        `${ITEMS.rabbitfoot.name} x${g.s.pockets.filter((p) => p === "rabbitfoot").length}`,
        C.green,
      );
  }
}
