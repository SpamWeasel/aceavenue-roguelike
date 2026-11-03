import { C } from "../../../game/colors";
import {
  betTotal,
  CRAPS_LABEL,
  type CrapsBetKind,
  type CrapsBets,
  canBet,
  emptyBets,
  maxOdds,
  resolveRoll,
} from "../../../game/craps";
import { ITEMS } from "../../../game/data/items";
import { type Game, money } from "../../../game/game";
import type { TableDef } from "../../../game/world";
import type { App, Screen } from "../app";
import { animMs } from "../settings";
import { COLS, ROWS, type Term } from "../term";
import { drawDie, felt } from "./draw";
import { NoticeScreen } from "./menus";
import type { PlayScreen } from "./play";

const KINDS: CrapsBetKind[] = ["pass", "dontPass", "odds", "field", "anySeven"];
const KIND_HELP: Record<CrapsBetKind, string> = {
  pass: "Wins on 7 or 11 at the come-out, then if the point comes back before a 7. Pays 1:1.",
  dontPass: "The opposite of Pass: wins on 2 or 3 and on a seven-out. 12 pushes. Pays 1:1.",
  odds: "Back up your Pass bet once there's a point. Pays true odds - no house edge at all.",
  field: "One roll: wins on 2, 3, 4, 9, 10, 11, 12 (2 and 12 pay double). Loses on 5-8.",
  anySeven: "One roll: any 7 pays 4:1.",
};

/** A craps table. You're always the shooter. */
export class CrapsScreen implements Screen {
  readonly opaque = true;
  private cursor = 0;
  private chip = 0;
  private bets: CrapsBets = emptyBets();
  private dice: [number, number] = [3, 4];
  private rolling = 0;
  private message = "Come-out roll. Put a bet on the Pass Line (or Don't Pass) and roll.";
  private messageColor: string = C.white;
  private history: number[] = [];
  private useDollar = false;

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

  private get point(): number | null {
    return this.game.points.get(this.tableKey) ?? null;
  }

  private set point(p: number | null) {
    this.game.points.set(this.tableKey, p);
  }

  private get tableKey(): string {
    return `${this.game.area.id}:${this.table.id}`;
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
    const kind = KINDS[this.cursor];
    if (!canBet(kind, this.point, this.bets)) {
      this.say(
        kind === "odds"
          ? "Odds go behind a Pass bet, once a point is set."
          : "Pass and Don't Pass bets go down on the come-out roll.",
        C.orange,
      );
      return;
    }
    let add = Math.min(this.chipValue, this.table.max - this.bets[kind]);
    if (kind === "odds") add = Math.min(add, maxOdds(this.bets) - this.bets.odds);
    if (add <= 0) {
      this.say(
        kind === "odds" ? "Odds are limited to twice your Pass bet." : "That's the table limit.",
        C.orange,
      );
      return;
    }
    if (!g.pay(add)) {
      this.say("You don't have enough cash.", C.orange);
      return;
    }
    this.bets[kind] += add;
    g.sound("chip");
  }

  private remove(): void {
    const g = this.game;
    const kind = KINDS[this.cursor];
    if ((kind === "pass" || kind === "dontPass") && this.point !== null) {
      this.say("That bet is working until the point is decided.", C.orange);
      return;
    }
    const back = Math.min(this.chipValue, this.bets[kind]);
    if (back <= 0) return;
    this.bets[kind] -= back;
    if (kind === "pass" && this.bets.odds > maxOdds(this.bets)) {
      g.receive(this.bets.odds - maxOdds(this.bets));
      this.bets.odds = maxOdds(this.bets);
    }
    g.receive(back);
    g.sound("chip");
  }

  private roll(): void {
    const g = this.game;
    if (betTotal(this.bets) <= 0) {
      this.say("Put some money on the table first.", C.orange);
      return;
    }
    const main = this.bets.pass + this.bets.dontPass + this.bets.field + this.bets.anySeven;
    if (main > 0 && main < this.table.min && this.point === null) {
      this.say(`The minimum bet is ${money(this.table.min)}.`, C.orange);
      return;
    }
    this.rolling = performance.now();
    g.sound("dice");
  }

  private settle(): void {
    const g = this.game;
    this.rolling = 0;
    this.dice = [g.rng.int(1, 6), g.rng.int(1, 6)];
    const before = { ...this.bets };
    const res = resolveRoll(this.dice, this.point, this.bets);
    this.point = res.point;
    this.bets = res.bets;
    this.history.push(this.dice[0] + this.dice[1]);
    if (this.history.length > 16) this.history.shift();
    let returned = res.returned;
    const settledStake = res.settled.reduce((s, x) => s + before[x.kind], 0);
    const lostStake = res.settled.filter((x) => x.net < 0).reduce((s, x) => s - x.net, 0);
    let dollar = false;
    if (this.useDollar && lostStake > 0 && g.useItem("dollar")) {
      returned += lostStake;
      dollar = true;
      this.useDollar = false;
    }
    g.receive(returned);
    const net = returned - settledStake;
    let text = res.message;
    if (net > 0) text += ` You win ${money(net)}.`;
    else if (net < 0) text += ` You lose ${money(-net)}.`;
    if (dollar) text += " Your Lucky Silver Dollar brings your losses back!";
    this.say(text, net > 0 ? C.lime : net < 0 ? C.red : C.white);
    if (net > 0) g.sound(net >= this.table.min * 10 ? "bigwin" : "win");
    else if (net < 0) g.sound("lose");
    if (res.settled.length) {
      const out = g.houseResult({ table: this.table, bet: settledStake, net, min: this.table.min });
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
        return;
      }
      if (g.s.over) this.leave(true);
    }
  }

  private leave(force = false): void {
    const g = this.game;
    if (!force && this.point !== null && (this.bets.pass || this.bets.dontPass || this.bets.odds)) {
      this.say(
        "Your line bets are working. Roll until the point is decided (or seven out).",
        C.orange,
      );
      return;
    }
    g.receive(betTotal(this.bets));
    this.bets = emptyBets();
    this.app.pop();
    this.play.after();
  }

  key(e: KeyboardEvent): void {
    if (this.rolling) return;
    const code = e.code;
    if (code === "Escape") {
      this.leave();
      return;
    }
    if (code === "ArrowUp") this.cursor = (this.cursor + KINDS.length - 1) % KINDS.length;
    else if (code === "ArrowDown") this.cursor = (this.cursor + 1) % KINDS.length;
    else if (
      code === "Enter" ||
      code === "NumpadEnter" ||
      code === "Space" ||
      code === "ArrowRight"
    )
      this.place();
    else if (code === "Backspace" || code === "Delete" || code === "ArrowLeft") this.remove();
    else if (code === "Tab" || code === "KeyC") {
      const n = this.chips().length;
      this.chip = (this.chip + (e.shiftKey ? n - 1 : 1)) % n;
    } else if (code === "KeyL" && this.game.has("dollar")) this.useDollar = !this.useDollar;
    else if (code === "KeyR") this.roll();
  }

  animating(now: number): boolean {
    if (!this.rolling) return false;
    if (now - this.rolling >= animMs(900)) this.settle();
    return true;
  }

  draw(t: Term, now: number): void {
    const g = this.game;
    const tb = this.table;
    const feltColor = g.casino?.theme.felt ?? C.felt;
    felt(t, 0, 0, COLS, ROWS, C.black);
    felt(t, 1, 2, COLS - 2, 29, feltColor);
    t.center(0, `CRAPS  ·  ${g.casino?.name ?? ""}`, C.yellow);
    t.center(
      1,
      `Bets ${money(tb.min)}-${money(tb.max)}  ·  You're the shooter  ·  Odds up to 2x your Pass bet`,
      C.gray,
    );

    // Point markers.
    const px0 = 10;
    t.text(px0, 4, "POINT", C.paper, feltColor);
    [4, 5, 6, 8, 9, 10].forEach((n, i) => {
      const on = this.point === n;
      t.text(
        px0 + 7 + i * 6,
        4,
        ` ${String(n).padStart(2)} `,
        on ? C.black : C.paper,
        on ? C.white : C.feltDark,
      );
    });
    t.text(
      px0 + 45,
      4,
      this.point === null ? "OFF  (come-out roll)" : `ON - roll a ${this.point} before a 7`,
      this.point === null ? C.gray : C.yellow,
      feltColor,
    );

    // Dice.
    const dx = 62;
    const d = this.rolling
      ? ([1 + Math.floor((now / 70) % 6), 1 + Math.floor((now / 90 + 3) % 6)] as [number, number])
      : this.dice;
    drawDie(t, dx, 8, d[0]);
    drawDie(t, dx + 11, 8, d[1]);
    if (!this.rolling) t.text(dx + 6, 14, `Total ${d[0] + d[1]}`, C.white, feltColor);

    // Bets.
    let y = 8;
    KINDS.forEach((k, i) => {
      const sel = i === this.cursor;
      const ok = canBet(k, this.point, this.bets) || this.bets[k] > 0;
      t.text(
        px0,
        y,
        `${sel ? "►" : " "} ${CRAPS_LABEL[k]}`,
        sel ? C.yellow : ok ? C.paper : C.gray,
        feltColor,
      );
      t.text(
        px0 + 16,
        y,
        this.bets[k] ? money(this.bets[k]) : "-",
        this.bets[k] ? C.gold : C.dim,
        feltColor,
      );
      y += 2;
    });
    t.text(px0, 19, KIND_HELP[KINDS[this.cursor]], C.paper, feltColor, COLS - 2);

    t.text(px0, 22, `Chip ${money(this.chipValue)}`, C.yellow, feltColor);
    t.text(
      px0 + 14,
      22,
      "↑↓ pick  Enter/→ add chip  Bksp/← take back  Tab chip  R roll  Esc leave",
      C.paper,
      feltColor,
      COLS - 2,
    );
    if (g.has("dollar"))
      t.text(
        px0,
        23,
        `L: ${this.useDollar ? "USING" : "use"} your ${ITEMS.dollar.name} on this roll`,
        this.useDollar ? C.green : C.gray,
        feltColor,
      );
    t.text(px0, 25, this.message, this.messageColor, feltColor, COLS - 2);

    t.text(px0, 28, "Rolls:", C.paper, feltColor);
    this.history.forEach((n, i) => {
      t.text(px0 + 7 + i * 3, 28, String(n).padStart(2), n === 7 ? C.red : C.white, feltColor);
    });

    const sx = 86;
    t.text(sx, 8, `Cash ${money(g.s.cash)}`, C.lime, feltColor);
    t.text(sx, 9, `On the table ${money(betTotal(this.bets))}`, C.yellow, feltColor);
    t.text(sx, 11, `Heat ${g.heatHere()}`, g.heatHere() >= 70 ? C.red : C.paper, feltColor);
    if (g.watched(tb)) t.text(sx, 12, "Pit boss watching!", C.orange, feltColor);
  }
}
