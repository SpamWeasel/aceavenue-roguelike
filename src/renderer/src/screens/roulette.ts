import { C } from "../../../game/colors";
import { ITEMS } from "../../../game/data/items";
import { type Game, money } from "../../../game/game";
import {
  betKey,
  betLabel,
  betReturn,
  isRedNumber,
  pocketColor,
  pocketName,
  type RouletteBet,
  type RouletteBetKind,
  spinPath,
  spinWheel,
  WHEEL_DOUBLE,
  WHEEL_SINGLE,
  type WheelDef,
} from "../../../game/roulette";
import type { TableDef } from "../../../game/world";
import type { App, Screen } from "../app";
import { animMs } from "../settings";
import { COLS, ROWS, type Term } from "../term";
import { felt } from "./draw";
import { NoticeScreen } from "./menus";
import type { PlayScreen } from "./play";

const BX = 10;
const CELL = 5;
const ROW_Y = [10, 11, 12];
const DOZEN_Y = 14;
const OUTSIDE_Y = 16;
const OUTSIDE: { kind: RouletteBetKind; label: string }[] = [
  { kind: "low", label: "1-18" },
  { kind: "even", label: "EVEN" },
  { kind: "red", label: "RED" },
  { kind: "black", label: "BLACK" },
  { kind: "odd", label: "ODD" },
  { kind: "high", label: "19-36" },
];

const POCKET_BG = { red: "#a01818", black: "#141414", green: "#0a6a2a" } as const;

/** A roulette table. */
export class RouletteScreen implements Screen {
  readonly opaque = true;
  private row = 1;
  private col = 1;
  private chip = 0;
  private bets = new Map<string, RouletteBet>();
  private lastBets: RouletteBet[] = [];
  private spinning: { result: number; path: number[]; start: number } | null = null;
  private result: number | null = null;
  private message = "Place chips on the layout, then spin.";
  private messageColor: string = C.white;
  private useDollar = false;
  private wheel: WheelDef;

  constructor(
    private app: App,
    private play: PlayScreen,
    private table: TableDef,
  ) {
    this.wheel = table.wheel as WheelDef;
    if (this.game.watched(table)) {
      this.message = "The pit boss is watching this table.";
      this.messageColor = C.orange;
    }
  }

  get game(): Game {
    return this.app.game as Game;
  }

  private chips(): number[] {
    const m = this.table.min;
    return [m, m * 5, m * 25, m * 100].filter((c) => c <= this.table.max);
  }

  private get chipValue(): number {
    const c = this.chips();
    return c[Math.min(this.chip, c.length - 1)];
  }

  /** The bet under the cursor. */
  private cellBet(row: number, col: number): { kind: RouletteBetKind; n: number } {
    if (row <= 2) {
      if (col === 0) return { kind: "straight", n: this.wheel.doubleZero && row === 2 ? 37 : 0 };
      if (col === 13) return { kind: "column", n: 3 - row };
      return { kind: "straight", n: (col - 1) * 3 + 3 - row };
    }
    if (row === 3) return { kind: "dozen", n: Math.ceil(col / 4) };
    return { kind: OUTSIDE[Math.floor((col - 1) / 2)].kind, n: 0 };
  }

  private staked(): number {
    let s = 0;
    for (const b of this.bets.values()) s += b.amount;
    return s;
  }

  private place(): void {
    const g = this.game;
    const b = this.cellBet(this.row, this.col);
    const key = betKey(b);
    const cur = this.bets.get(key)?.amount ?? 0;
    const add = Math.min(this.chipValue, this.table.max - cur);
    if (add <= 0) {
      this.say(`The table limit is ${money(this.table.max)} a bet.`, C.orange);
      return;
    }
    if (!g.pay(add)) {
      this.say("You don't have enough cash for that chip.", C.orange);
      return;
    }
    this.bets.set(key, { ...b, amount: cur + add });
    g.sound("chip");
    this.result = null;
  }

  private remove(): void {
    const g = this.game;
    const key = betKey(this.cellBet(this.row, this.col));
    const bet = this.bets.get(key);
    if (!bet) return;
    const back = Math.min(this.chipValue, bet.amount);
    bet.amount -= back;
    g.receive(back);
    if (bet.amount <= 0) this.bets.delete(key);
    g.sound("chip");
  }

  private clearAll(): void {
    const g = this.game;
    g.receive(this.staked());
    this.bets.clear();
  }

  private rebet(): void {
    const g = this.game;
    if (this.bets.size || !this.lastBets.length) return;
    const total = this.lastBets.reduce((s, b) => s + b.amount, 0);
    if (!g.pay(total)) {
      this.say("Not enough cash to repeat those bets.", C.orange);
      return;
    }
    for (const b of this.lastBets) this.bets.set(betKey(b), { ...b });
    g.sound("chip");
  }

  private say(text: string, color: string = C.white): void {
    this.message = text;
    this.messageColor = color;
  }

  private spin(): void {
    const g = this.game;
    if (!this.bets.size) {
      this.say("Place a bet first.", C.orange);
      return;
    }
    if (this.staked() < this.table.min) {
      this.say(`The minimum is ${money(this.table.min)}.`, C.orange);
      return;
    }
    const result = spinWheel(this.wheel, g.rng);
    const order = this.wheel.doubleZero ? WHEEL_DOUBLE : WHEEL_SINGLE;
    this.spinning = {
      result,
      path: spinPath(this.wheel, result, order.length * 3 + g.rng.int(0, order.length)),
      start: performance.now(),
    };
    this.say("No more bets!", C.gray);
    g.sound("tick");
  }

  private settle(): void {
    const g = this.game;
    const s = this.spinning;
    if (!s) return;
    this.spinning = null;
    const n = s.result;
    this.result = n;
    const hist = g.spinHistory(this.table);
    hist.push(n);
    if (hist.length > 200) hist.splice(0, hist.length - 200);
    const bets = [...this.bets.values()];
    const staked = this.staked();
    let back = bets.reduce((sum, b) => sum + betReturn(b, n), 0);
    const lost = bets.filter((b) => betReturn(b, n) === 0).reduce((sum, b) => sum + b.amount, 0);
    let dollar = false;
    if (this.useDollar && lost > 0 && g.has("dollar")) {
      g.useItem("dollar");
      back += lost;
      dollar = true;
      this.useDollar = false;
    }
    g.receive(back);
    const net = back - staked;
    this.lastBets = bets.map((b) => ({ ...b }));
    this.bets.clear();
    const name = `${pocketName(n)} ${pocketColor(n).toUpperCase()}`;
    if (net > 0) {
      this.say(`${name}! You win ${money(net)}.`, C.lime);
      g.sound(net >= staked * 5 ? "bigwin" : "win");
    } else if (net === 0) this.say(`${name}. You break even.`, C.light);
    else {
      this.say(`${name}. You lose ${money(-net)}.`, C.red);
      g.sound("lose");
    }
    if (dollar) {
      this.say(`${name}. Your Lucky Silver Dollar brings back your losing bets!`, C.green);
      g.log("Your Lucky Silver Dollar saves a roulette spin.", C.green);
    }
    const out = g.houseResult({ table: this.table, bet: staked, net, min: this.table.min });
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

  private leave(): void {
    this.clearAll();
    this.app.pop();
    this.play.after();
  }

  key(e: KeyboardEvent): void {
    if (this.spinning) return;
    const code = e.code;
    if (code === "Escape") {
      this.leave();
      return;
    }
    if (code === "ArrowUp") this.row = Math.max(0, this.row - 1);
    else if (code === "ArrowDown") this.row = Math.min(4, this.row + 1);
    else if (code === "ArrowLeft") this.col = Math.max(this.row <= 2 ? 0 : 1, this.col - 1);
    else if (code === "ArrowRight") this.col = Math.min(this.row <= 2 ? 13 : 12, this.col + 1);
    else if (code === "Enter" || code === "NumpadEnter" || code === "Space") this.place();
    else if (code === "Backspace" || code === "Delete") this.remove();
    else if (code === "Tab" || code === "KeyC") {
      const n = this.chips().length;
      this.chip = (this.chip + (e.shiftKey ? n - 1 : 1)) % n;
    } else if (code === "KeyX") this.clearAll();
    else if (code === "KeyB") this.rebet();
    else if (code === "KeyL" && this.game.has("dollar")) this.useDollar = !this.useDollar;
    else if (code === "KeyR" || code === "KeyS") this.spin();
    if (this.row > 2) this.col = Math.max(1, Math.min(12, this.col));
  }

  private spinDuration(): number {
    return animMs(2800);
  }

  animating(now: number): boolean {
    if (!this.spinning) return false;
    if (now - this.spinning.start >= this.spinDuration()) this.settle();
    return true;
  }

  draw(t: Term, now: number): void {
    const g = this.game;
    const tb = this.table;
    const feltColor = g.casino?.theme.felt ?? C.felt;
    felt(t, 0, 0, COLS, ROWS, C.black);
    felt(t, 1, 2, COLS - 2, 29, feltColor);
    t.center(0, `ROULETTE  ·  ${tb.label}  ·  ${g.casino?.name ?? ""}`, C.yellow);
    t.center(
      1,
      `${this.wheel.doubleZero ? "Double-zero" : "Single-zero"} wheel  ·  Bets ${money(tb.min)}-${money(tb.max)}  ·  Straight up pays 35:1`,
      C.gray,
    );

    // The wheel, as a strip of pockets passing under the ball.
    const order = this.wheel.doubleZero ? WHEEL_DOUBLE : WHEEL_SINGLE;
    let centerIdx: number;
    if (this.spinning) {
      const p = Math.min(1, (now - this.spinning.start) / this.spinDuration());
      const ease = 1 - (1 - p) ** 3;
      const step = Math.floor(ease * (this.spinning.path.length - 1));
      centerIdx = order.indexOf(this.spinning.path[step]);
      if (step !== this.lastTick) {
        this.lastTick = step;
        if (p < 0.98) g.sound("tick");
      }
    } else centerIdx = order.indexOf(this.result ?? order[0]);
    const span = 9;
    const wx = Math.floor(COLS / 2) - span * 4 - 2;
    for (let k = -span; k <= span; k++) {
      const n = order[(((centerIdx + k) % order.length) + order.length) % order.length];
      const label = pocketName(n).padStart(2, " ");
      const x = wx + (k + span) * 4;
      const bg = POCKET_BG[pocketColor(n)];
      t.text(x, 5, ` ${label} `, C.white, k === 0 ? bg : bg);
      if (k === 0) {
        t.put(x + 1, 4, "●", C.white);
        t.put(x + 2, 4, "▼", C.yellow);
      }
    }
    for (let x = wx; x < wx + (span * 2 + 1) * 4; x++) {
      t.put(x, 6, "▀", C.darkGold, feltColor);
    }

    // The layout.
    const cursorBet = betKey(this.cellBet(this.row, this.col));
    const has = (k: string) => this.bets.has(k);
    const cell = (x: number, y: number, w: number, text: string, bg: string, key: string) => {
      const sel = key === cursorBet && !this.spinning;
      const pad = Math.floor((w - text.length) / 2);
      t.fill(x, y, w, 1, " ", C.white, sel ? C.yellow : bg);
      t.text(x + pad, y, text, sel ? C.black : C.white, sel ? C.yellow : bg);
      if (has(key)) t.put(x + w - 1, y, "●", sel ? C.black : C.gold, sel ? C.yellow : bg);
      if (this.result !== null && key === betKey({ kind: "straight", n: this.result }))
        t.put(x, y, "◄", C.white, sel ? C.yellow : bg);
    };
    // Zero column.
    if (this.wheel.doubleZero) {
      cell(BX, ROW_Y[0], 4, "0", POCKET_BG.green, betKey({ kind: "straight", n: 0 }));
      cell(BX, ROW_Y[1], 4, "0", POCKET_BG.green, betKey({ kind: "straight", n: 0 }));
      cell(BX, ROW_Y[2], 4, "00", POCKET_BG.green, betKey({ kind: "straight", n: 37 }));
    } else
      for (const y of ROW_Y)
        cell(BX, y, 4, "0", POCKET_BG.green, betKey({ kind: "straight", n: 0 }));
    for (let row = 0; row < 3; row++) {
      for (let col = 1; col <= 12; col++) {
        const n = (col - 1) * 3 + 3 - row;
        cell(
          BX + 4 + (col - 1) * CELL,
          ROW_Y[row],
          CELL,
          String(n),
          isRedNumber(n) ? POCKET_BG.red : POCKET_BG.black,
          betKey({ kind: "straight", n }),
        );
      }
      cell(
        BX + 4 + 12 * CELL,
        ROW_Y[row],
        CELL,
        "2:1",
        feltColor,
        betKey({ kind: "column", n: 3 - row }),
      );
    }
    for (let d = 1; d <= 3; d++)
      cell(
        BX + 4 + (d - 1) * CELL * 4,
        DOZEN_Y,
        CELL * 4,
        ["1st 12", "2nd 12", "3rd 12"][d - 1],
        "#1a1a1a",
        betKey({ kind: "dozen", n: d }),
      );
    OUTSIDE.forEach((o, i) => {
      const bg =
        o.kind === "red" ? POCKET_BG.red : o.kind === "black" ? POCKET_BG.black : "#1a1a1a";
      cell(BX + 4 + i * CELL * 2, OUTSIDE_Y, CELL * 2, o.label, bg, betKey({ kind: o.kind, n: 0 }));
    });
    const under = this.cellBet(this.row, this.col);
    t.text(
      BX,
      18,
      `Cursor: ${betLabel(under)} (pays ${under.kind === "straight" ? "35" : under.kind === "dozen" || under.kind === "column" ? "2" : "1"}:1)`,
      C.paper,
      feltColor,
    );

    // Controls and message.
    t.text(BX, 21, `Chip ${money(this.chipValue)}`, C.yellow, feltColor);
    t.text(
      BX + 14,
      21,
      "Arrows move  Enter place  Bksp remove  Tab chip  B rebet  X clear  R spin  Esc leave",
      C.paper,
      feltColor,
      COLS - 2,
    );
    if (g.has("dollar"))
      t.text(
        BX,
        22,
        `L: ${this.useDollar ? "USING" : "use"} your ${ITEMS.dollar.name} on this spin`,
        this.useDollar ? C.green : C.gray,
        feltColor,
      );
    t.text(BX, 24, this.message, this.messageColor, feltColor, COLS - 2);

    // Side panel.
    const px = 84;
    let py = 9;
    t.text(px, py++, `Cash ${money(g.s.cash)}`, C.lime, feltColor);
    t.text(px, py++, `On the table ${money(this.staked())}`, C.yellow, feltColor);
    for (const b of [...this.bets.values()].slice(0, 6))
      t.text(px + 1, py++, `${betLabel(b)}: ${money(b.amount)}`, C.paper, feltColor, COLS - 2);
    py++;
    t.text(px, py++, `Heat ${g.heatHere()}`, g.heatHere() >= 70 ? C.red : C.paper, feltColor);
    if (g.watched(tb)) t.text(px, py++, "Pit boss watching!", C.orange, feltColor);

    // History.
    const watch = g.skill("wheel");
    const hist = g.spinHistory(tb);
    const shown = hist.slice(watch >= 1 ? -24 : -8);
    t.text(BX, 26, watch >= 1 ? "Last 24 spins:" : "Last spins:", C.paper, feltColor);
    shown.forEach((n, i) => {
      t.text(BX + 15 + i * 3, 26, pocketName(n).padStart(2), C.white, POCKET_BG[pocketColor(n)]);
    });
    if (watch >= 1 && hist.length >= 10) {
      const counts = new Map<number, number>();
      for (const n of hist.slice(-60)) counts.set(n, (counts.get(n) ?? 0) + 1);
      const hot = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      t.text(
        BX,
        27,
        `Hot numbers: ${hot.map(([n, c]) => `${pocketName(n)} (${c}x)`).join(", ")}`,
        C.cyan,
        feltColor,
      );
    }
    if (watch >= 2)
      t.text(
        BX,
        28,
        this.wheel.bias.length
          ? `Wheel Watch: this wheel is worn. It favors ${this.wheel.bias.map(pocketName).join(", ")}.`
          : "Wheel Watch: this wheel runs true. No edge here.",
        this.wheel.bias.length ? C.lime : C.gray,
        feltColor,
      );
  }

  private lastTick = -1;
}
