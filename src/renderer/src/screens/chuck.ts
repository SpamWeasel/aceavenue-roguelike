import {
  CHUCK_SPOTS,
  type ChuckBets,
  chuckReturn,
  chuckTotal,
  spotHelp,
  spotKey,
  spotLabel,
} from "../../../game/chuckaluck";
import { C } from "../../../game/colors";
import { type Game, money } from "../../../game/game";
import type { TableDef } from "../../../game/world";
import type { App, Screen } from "../app";
import { animMs } from "../settings";
import { COLS, ROWS, type Term } from "../term";
import { DIE_W, drawDie, felt } from "./draw";
import { NoticeScreen } from "./menus";
import type { PlayScreen } from "./play";

/** Chuck-a-luck: three dice in a spinning wire birdcage. */
export class ChuckScreen implements Screen {
  readonly opaque = true;
  private cursor = 0;
  private chip = 0;
  private bets: ChuckBets = {};
  private dice: number[] = [2, 4, 6];
  private rolling = 0;
  private message =
    "Put chips on a number, High, Low or Any Triple, then press R to spin the cage.";
  private messageColor: string = C.white;
  private history: number[][] = [];
  private last: ChuckBets = {};

  constructor(
    private app: App,
    private play: PlayScreen,
    private table: TableDef,
  ) {
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
    return [m, m * 5, m * 25].filter((c) => c <= this.table.max);
  }

  private get chipValue(): number {
    const c = this.chips();
    return c[Math.min(this.chip, c.length - 1)];
  }

  private say(text: string, color: string = C.white): void {
    this.message = text;
    this.messageColor = color;
  }

  private place(): void {
    const g = this.game;
    const k = spotKey(CHUCK_SPOTS[this.cursor]);
    const add = Math.min(this.chipValue, this.table.max - (this.bets[k] ?? 0));
    if (add <= 0) {
      this.say("That's the table limit on one spot.", C.orange);
      return;
    }
    if (!g.pay(add)) {
      this.say("You don't have enough cash.", C.orange);
      return;
    }
    this.bets[k] = (this.bets[k] ?? 0) + add;
    g.sound("chip");
  }

  private remove(): void {
    const g = this.game;
    const k = spotKey(CHUCK_SPOTS[this.cursor]);
    const back = Math.min(this.chipValue, this.bets[k] ?? 0);
    if (back <= 0) return;
    this.bets[k] = (this.bets[k] ?? 0) - back;
    if (!this.bets[k]) delete this.bets[k];
    g.receive(back);
    g.sound("chip");
  }

  /** Puts the same bets down again. */
  private rebet(): void {
    const g = this.game;
    const need = chuckTotal(this.last);
    if (!need || chuckTotal(this.bets)) return;
    if (!g.pay(need)) {
      this.say("You can't cover the same bets again.", C.orange);
      return;
    }
    this.bets = { ...this.last };
    g.sound("chip");
  }

  private roll(): void {
    const total = chuckTotal(this.bets);
    if (total <= 0) {
      this.say("Put some money on the table first.", C.orange);
      return;
    }
    if (total < this.table.min) {
      this.say(`The minimum is ${money(this.table.min)} in all.`, C.orange);
      return;
    }
    this.rolling = performance.now();
    this.game.sound("dice");
  }

  private settle(): void {
    const g = this.game;
    this.rolling = 0;
    this.dice = [g.rng.int(1, 6), g.rng.int(1, 6), g.rng.int(1, 6)];
    const staked = chuckTotal(this.bets);
    let returned = 0;
    for (const s of CHUCK_SPOTS) {
      const stake = this.bets[spotKey(s)] ?? 0;
      if (stake) returned += chuckReturn(s, stake, this.dice);
    }
    this.last = { ...this.bets };
    this.bets = {};
    this.history.push([...this.dice]);
    if (this.history.length > 10) this.history.shift();
    g.receive(returned);
    const net = returned - staked;
    const triple = this.dice[0] === this.dice[1] && this.dice[1] === this.dice[2];
    const sum = this.dice[0] + this.dice[1] + this.dice[2];
    let text = `${this.dice.join(" - ")}${triple ? ", a triple!" : `, total ${sum}`}.`;
    if (net > 0) text += ` You win ${money(net)}.`;
    else if (net < 0) text += ` You lose ${money(-net)}.`;
    else text += " You break even.";
    this.say(
      `${text}  (Enter on an empty table bets the same again.)`,
      net > 0 ? C.lime : net < 0 ? C.red : C.white,
    );
    if (net > 0) g.sound(net >= this.table.min * 10 ? "bigwin" : "win");
    else if (net < 0) g.sound("lose");
    const out = g.houseResult({
      table: this.table,
      bet: staked,
      net,
      min: this.table.min,
      jackpot: triple && net >= this.table.min * 30,
    });
    if (out) {
      this.app.popTo(this.play);
      this.app.push(
        new NoticeScreen(
          this.app,
          "SHOWN THE DOOR",
          ["Security walked you off the boat.", "Your heat there needs to cool off."],
          C.red,
        ),
      );
      this.play.after();
      return;
    }
    if (g.s.over) this.leave();
  }

  private leave(): void {
    this.game.receive(chuckTotal(this.bets));
    this.bets = {};
    this.app.pop();
    this.play.after();
  }

  key(e: KeyboardEvent): void {
    if (this.rolling) return;
    const code = e.code;
    const n = CHUCK_SPOTS.length;
    if (code === "Escape") this.leave();
    else if (code === "ArrowUp") this.cursor = (this.cursor + n - 1) % n;
    else if (code === "ArrowDown") this.cursor = (this.cursor + 1) % n;
    else if (/^(Digit|Numpad)[1-6]$/.test(code)) this.cursor = Number(code.slice(-1)) - 1;
    else if (
      code === "Enter" ||
      code === "NumpadEnter" ||
      code === "Space" ||
      code === "ArrowRight"
    ) {
      if (code !== "ArrowRight" && !chuckTotal(this.bets) && chuckTotal(this.last)) this.rebet();
      else this.place();
    } else if (code === "Backspace" || code === "Delete" || code === "ArrowLeft") this.remove();
    else if (code === "Tab" || code === "KeyC") {
      const k = this.chips().length;
      this.chip = (this.chip + (e.shiftKey ? k - 1 : 1)) % k;
    } else if (code === "KeyR") this.roll();
  }

  animating(now: number): boolean {
    if (!this.rolling) return false;
    if (now - this.rolling >= animMs(1100)) this.settle();
    return true;
  }

  draw(t: Term, now: number): void {
    const g = this.game;
    const tb = this.table;
    const feltColor = g.casino?.theme.felt ?? C.felt;
    felt(t, 0, 0, COLS, ROWS, C.black);
    felt(t, 1, 2, COLS - 2, 29, feltColor);
    t.center(0, `CHUCK-A-LUCK  ·  ${g.casino?.name ?? ""}`, C.yellow);
    t.center(
      1,
      `Bets ${money(tb.min)}-${money(tb.max)} a spot  ·  Three dice in the birdcage  ·  Numbers pay once per die`,
      C.gray,
    );

    // The birdcage.
    const cx = 52;
    const cy = 5;
    const cw = 3 * (DIE_W + 2) + 3;
    const spin = this.rolling ? Math.floor(now / 80) : 0;
    t.text(cx + Math.floor(cw / 2) - 1, cy - 1, "╦", C.gold, feltColor);
    for (let x = 0; x < cw; x++) {
      t.put(cx + x, cy, (x + spin) % 4 === 0 ? "╤" : "═", C.gold, feltColor);
      t.put(cx + x, cy + 7, (x + spin) % 4 === 0 ? "╧" : "═", C.gold, feltColor);
    }
    for (let y = 1; y < 7; y++) {
      t.put(cx, cy + y, "║", C.gold, feltColor);
      t.put(cx + cw - 1, cy + y, "║", C.gold, feltColor);
    }
    const d = this.rolling
      ? [0, 1, 2].map((i) => 1 + Math.floor((now / (60 + i * 17) + i * 2) % 6))
      : this.dice;
    d.forEach((n, i) => {
      const bob = this.rolling ? (Math.floor(now / 120) + i) % 2 : 0;
      drawDie(t, cx + 2 + i * (DIE_W + 2), cy + 1 + bob, n, {
        hot: !this.rolling && CHUCK_SPOTS[this.cursor] === n,
      });
    });
    if (!this.rolling) t.text(cx + 2, cy + 9, `Total ${d[0] + d[1] + d[2]}`, C.white, feltColor);

    // The layout.
    const px0 = 6;
    let y = 5;
    CHUCK_SPOTS.forEach((s, i) => {
      const sel = i === this.cursor;
      const stake = this.bets[spotKey(s)] ?? 0;
      t.text(px0, y, `${sel ? "►" : " "} ${spotLabel(s)}`, sel ? C.yellow : C.paper, feltColor);
      t.text(px0 + 16, y, stake ? money(stake) : "-", stake ? C.gold : C.dim, feltColor);
      y += i === 5 ? 2 : 1;
    });
    t.text(px0, 17, spotHelp(CHUCK_SPOTS[this.cursor]), C.paper, feltColor, COLS - 2);

    t.text(px0, 20, `Chip ${money(this.chipValue)}`, C.yellow, feltColor);
    t.text(
      px0 + 14,
      20,
      "↑↓/1-6 pick  Enter/→ add chip  Bksp/← take back  Tab chip  R spin  Esc leave",
      C.paper,
      feltColor,
      COLS - 2,
    );
    t.text(px0, 23, this.message, this.messageColor, feltColor, COLS - 2);

    t.text(px0, 26, "Last spins:", C.paper, feltColor);
    this.history.forEach((h, i) => {
      const triple = h[0] === h[1] && h[1] === h[2];
      t.text(px0 + 12 + i * 5, 26, h.join(""), triple ? C.gold : C.white, feltColor);
    });

    const sx = 90;
    t.text(sx, 5, `Cash ${money(g.s.cash)}`, C.lime, feltColor);
    t.text(sx, 6, `On the table ${money(chuckTotal(this.bets))}`, C.yellow, feltColor);
    t.text(sx, 8, `Heat ${g.heatHere()}`, g.heatHere() >= 70 ? C.red : C.paper, feltColor);
    if (g.watched(tb)) t.text(sx, 9, "Pit boss watching!", C.orange, feltColor);
  }
}
