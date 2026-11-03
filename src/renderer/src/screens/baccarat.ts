import {
  BANKER_PAYS,
  type BaccaratBet,
  type BaccaratCoup,
  bacReturn,
  bacTotal,
  dealCoup,
  TIE_PAYS,
} from "../../../game/baccarat";
import type { Card } from "../../../game/cards";
import { C } from "../../../game/colors";
import { type Game, money } from "../../../game/game";
import type { TableDef } from "../../../game/world";
import type { App, Screen } from "../app";
import { animMs } from "../settings";
import { COLS, ROWS, type Term } from "../term";
import { drawHand, felt } from "./draw";
import { NoticeScreen } from "./menus";
import type { PlayScreen } from "./play";

const KINDS: BaccaratBet[] = ["player", "banker", "tie"];
const LABEL: Record<BaccaratBet, string> = { player: "Player", banker: "Banker", tie: "Tie" };
const PAYS: Record<BaccaratBet, string> = {
  player: "pays 1:1",
  banker: `pays ${BANKER_PAYS}:1 (5% commission)`,
  tie: `pays ${TIE_PAYS}:1`,
};
/** Results are kept in the table's history as numbers. */
const CODE: Record<BaccaratBet, number> = { player: 1, banker: 2, tie: 3 };
const STEP = 450;

/** Punto banco. Bet on a hand and watch the cards fall. */
export class BaccaratScreen implements Screen {
  readonly opaque = true;
  private cursor = 0;
  private chip = 0;
  private bets: Record<BaccaratBet, number> = { player: 0, banker: 0, tie: 0 };
  private last: Record<BaccaratBet, number> | null = null;
  private coup: BaccaratCoup | null = null;
  private dealtAt = 0;
  private settled = true;
  private message = "Place your bets: Player, Banker or Tie. Then press R to deal.";
  private messageColor: string = C.white;

  constructor(
    private app: App,
    private play: PlayScreen,
    private table: TableDef,
  ) {}

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

  private total(): number {
    return this.bets.player + this.bets.banker + this.bets.tie;
  }

  private say(text: string, color: string = C.white): void {
    this.message = text;
    this.messageColor = color;
  }

  private place(): void {
    const g = this.game;
    const k = KINDS[this.cursor];
    const add = Math.min(this.chipValue, this.table.max - this.bets[k]);
    if (add <= 0) {
      this.say("That's the table limit.", C.orange);
      return;
    }
    if (!g.pay(add)) {
      this.say("You don't have enough cash.", C.orange);
      return;
    }
    this.bets[k] += add;
    g.sound("chip");
  }

  private remove(): void {
    const g = this.game;
    const k = KINDS[this.cursor];
    const back = Math.min(this.chipValue, this.bets[k]);
    if (back <= 0) return;
    this.bets[k] -= back;
    g.receive(back);
    g.sound("chip");
  }

  private rebet(): void {
    const g = this.game;
    if (this.total() || !this.last) return;
    const sum = this.last.player + this.last.banker + this.last.tie;
    if (!g.pay(sum)) {
      this.say("Not enough cash to repeat those bets.", C.orange);
      return;
    }
    this.bets = { ...this.last };
    g.sound("chip");
  }

  private deal(): void {
    const g = this.game;
    if (this.total() < this.table.min) {
      this.say(`The minimum is ${money(this.table.min)}.`, C.orange);
      return;
    }
    const shoe = g.shoe(this.table);
    if (shoe.needsShuffle()) {
      shoe.shuffle();
      g.sound("shuffle");
    }
    this.coup = dealCoup(shoe);
    this.dealtAt = performance.now();
    this.settled = false;
    this.say("", C.white);
  }

  /** Cards shown so far: player, banker, player, banker, then any third cards. */
  private shown(now: number): { player: Card[]; banker: Card[] } {
    const c = this.coup;
    if (!c) return { player: [], banker: [] };
    if (this.settled) return { player: c.player, banker: c.banker };
    const n = Math.floor((now - this.dealtAt) / animMs(STEP)) + 1;
    const order: ["player" | "banker", number][] = [
      ["player", 0],
      ["banker", 0],
      ["player", 1],
      ["banker", 1],
    ];
    if (c.player[2]) order.push(["player", 2]);
    if (c.banker[2]) order.push(["banker", 2]);
    const out = { player: [] as Card[], banker: [] as Card[] };
    for (const [side, i] of order.slice(0, n)) out[side].push(c[side][i]);
    return out;
  }

  private cardCount(): number {
    const c = this.coup;
    return c ? c.player.length + c.banker.length : 0;
  }

  private settle(): void {
    const g = this.game;
    const c = this.coup as BaccaratCoup;
    this.settled = true;
    const staked = this.total();
    let back = 0;
    for (const k of KINDS) if (this.bets[k]) back += bacReturn(k, this.bets[k], c.winner);
    g.receive(back);
    const net = back - staked;
    const hist = g.spinHistory(this.table);
    hist.push(CODE[c.winner]);
    if (hist.length > 60) hist.shift();
    const who =
      c.winner === "tie"
        ? `A tie at ${bacTotal(c.player)}`
        : `${LABEL[c.winner]} wins, ${bacTotal(c.winner === "player" ? c.player : c.banker)} to ${bacTotal(c.winner === "player" ? c.banker : c.player)}`;
    this.say(
      net > 0
        ? `${who}. You win ${money(net)}.`
        : net < 0
          ? `${who}. You lose ${money(-net)}.`
          : `${who}. Your bets come back.`,
      net > 0 ? C.lime : net < 0 ? C.red : C.light,
    );
    g.sound(net > 0 ? "win" : net < 0 ? "lose" : "chip");
    this.last = { ...this.bets };
    this.bets = { player: 0, banker: 0, tie: 0 };
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
    const g = this.game;
    g.receive(this.total());
    this.bets = { player: 0, banker: 0, tie: 0 };
    this.app.pop();
    this.play.after();
  }

  key(e: KeyboardEvent): void {
    if (!this.settled) return;
    const code = e.code;
    if (code === "Escape") {
      this.leave();
      return;
    }
    if (code === "ArrowUp") this.cursor = (this.cursor + 2) % 3;
    else if (code === "ArrowDown") this.cursor = (this.cursor + 1) % 3;
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
    } else if (code === "KeyB") this.rebet();
    else if (code === "KeyR") this.deal();
  }

  animating(now: number): boolean {
    if (this.settled) return false;
    if (now - this.dealtAt >= animMs(STEP) * (this.cardCount() + 1)) this.settle();
    return true;
  }

  draw(t: Term, now: number): void {
    const g = this.game;
    const tb = this.table;
    const feltColor = g.casino?.theme.felt ?? C.felt;
    felt(t, 0, 0, COLS, ROWS, C.black);
    felt(t, 1, 2, COLS - 2, 29, feltColor);
    t.center(0, `BACCARAT  ·  ${g.casino?.name ?? ""}`, C.gold);
    t.center(
      1,
      `Bets ${money(tb.min)}-${money(tb.max)}  ·  Closest to 9 wins  ·  Tens and faces count 0`,
      C.gray,
    );

    const s = this.shown(now);
    const done = this.settled && this.coup;
    const w = this.coup?.winner;
    t.text(14, 4, "PLAYER", w === "player" && done ? C.yellow : C.paper, feltColor);
    t.text(52, 4, "BANKER", w === "banker" && done ? C.yellow : C.paper, feltColor);
    drawHand(t, 14, 5, s.player, 30);
    drawHand(t, 52, 5, s.banker, 30);
    if (s.player.length) t.text(14, 11, `Total ${bacTotal(s.player)}`, C.white, feltColor);
    if (s.banker.length) t.text(52, 11, `Total ${bacTotal(s.banker)}`, C.white, feltColor);
    if (done && this.coup) t.text(14, 12, this.coup.notes.join(" "), C.gray, feltColor);

    KINDS.forEach((k, i) => {
      const sel = i === this.cursor;
      const y = 15 + i * 2;
      t.text(14, y, `${sel ? "►" : " "} ${LABEL[k]}`, sel ? C.yellow : C.paper, feltColor);
      t.text(
        26,
        y,
        this.bets[k] ? money(this.bets[k]) : "-",
        this.bets[k] ? C.gold : C.dim,
        feltColor,
      );
      t.text(38, y, PAYS[k], C.gray, feltColor);
    });
    t.text(14, 22, `Chip ${money(this.chipValue)}`, C.yellow, feltColor);
    t.text(
      28,
      22,
      "↑↓ pick  Enter add  Bksp take back  Tab chip  B rebet  R deal  Esc leave",
      C.paper,
      feltColor,
      COLS - 2,
    );
    t.text(14, 24, this.message, this.messageColor, feltColor, COLS - 2);

    // The bead road: recent winners.
    const hist = g.spinHistory(tb);
    t.text(14, 27, "Recent coups:", C.paper, feltColor);
    hist.slice(-30).forEach((code, i) => {
      const ch = code === 1 ? "P" : code === 2 ? "B" : "T";
      const bg = code === 1 ? C.navy : code === 2 ? C.darkRed : C.darkGreen;
      t.text(28 + i * 2, 27, ch, C.white, bg);
    });

    const sx = 86;
    t.text(sx, 15, `Cash ${money(g.s.cash)}`, C.lime, feltColor);
    t.text(sx, 16, `On the table ${money(this.total())}`, C.yellow, feltColor);
    t.text(sx, 18, `Heat ${g.heatHere()}`, g.heatHere() >= 70 ? C.red : C.paper, feltColor);
    t.text(sx, 19, `Club pts ${Math.floor(g.s.comps)}`, C.gold, feltColor);
  }
}
