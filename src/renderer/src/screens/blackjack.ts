import {
  type BjMove,
  type BjRules,
  BlackjackRound,
  basicStrategy,
  MOVE_NAME,
  rulesText,
} from "../../../game/blackjack";
import { bjTotal, type Card, type Shoe } from "../../../game/cards";
import { C } from "../../../game/colors";
import type { RollerDef } from "../../../game/data/casinos";
import { ITEMS, PEEK_HEAT } from "../../../game/data/items";
import { type Game, money } from "../../../game/game";
import type { TableDef } from "../../../game/world";
import type { App, Screen } from "../app";
import { animMs } from "../settings";
import { COLS, ROWS, type Term } from "../term";
import { buttons, buttonsWidth, drawHand, drawPortrait, felt } from "./draw";
import { ConfirmScreen, NoticeScreen } from "./menus";
import type { PlayScreen } from "./play";

type Phase = "bet" | "insurance" | "play" | "reveal" | "result";

const OUTCOME_TEXT = {
  blackjack: ["BLACKJACK!", C.gold],
  win: ["WIN", C.lime],
  push: ["PUSH", C.light],
  lose: ["LOSE", C.red],
  bust: ["BUST", C.red],
} as const;

/** Blackjack at a house table, or against a high roller who deals (a duel). */
export class BlackjackScreen implements Screen {
  readonly opaque = true;
  private phase: Phase = "bet";
  private round: BlackjackRound | null = null;
  private bet: number;
  private cursor = 0;
  private message = "";
  private messageColor: string = C.white;
  private speech = "";
  private revealAt = 0;
  private shoe: Shoe;
  private rules: BjRules;
  private min: number;
  private max: number;
  /** Duels: what's on the table on each side. */
  private stack = 0;
  private theirStack = 0;
  private countAtBet = 0;
  private peeked = false;
  private finished = false;
  readonly music: "duel" | "boss" | undefined;

  constructor(
    private app: App,
    private play: PlayScreen,
    private table: TableDef | null,
    private roller: RollerDef | null = null,
  ) {
    const g = this.game;
    if (roller) {
      this.rules = roller.rules as BjRules;
      this.shoe = g.duelShoe(this.rules.decks);
      this.min = Math.max(1, Math.round(roller.stake / 20));
      this.max = Math.round(roller.stake / 4);
      this.stack = roller.stake;
      this.theirStack = roller.stake;
      this.speech = roller.challenge;
      this.music = roller.boss ? "boss" : "duel";
    } else {
      const tb = table as TableDef;
      this.rules = tb.rules as BjRules;
      // Lucky hour: blackjacks pay 2 to 1 at this table for the visit.
      if (g.hotTable === tb.id) this.rules = { ...this.rules, bjPays: 2 };
      this.shoe = g.shoe(tb);
      this.min = tb.min;
      this.max = tb.max;
      this.music = undefined;
      this.message = g.watched(tb) ? "The pit boss is watching this table." : "";
      this.messageColor = C.orange;
    }
    this.bet = this.min;
  }

  get game(): Game {
    return this.app.game as Game;
  }

  /** Money you can bet from: your cash, or your stack in a duel. */
  private get bank(): number {
    return this.roller ? this.stack : this.game.s.cash;
  }

  private maxBet(): number {
    let m = Math.min(this.max, this.bank);
    if (this.roller) m = Math.min(m, Math.max(this.min, this.theirStack));
    return m;
  }

  private clampBet(): void {
    this.bet = Math.max(this.min, Math.min(this.maxBet(), this.bet));
  }

  private takeMoney(n: number): boolean {
    if (this.roller) {
      if (n > this.stack) return false;
      this.stack -= n;
      return true;
    }
    return this.game.pay(n);
  }

  private deal(): void {
    const g = this.game;
    this.clampBet();
    if (this.bank < this.min) {
      this.say("You don't have enough for the minimum bet.", C.orange);
      return;
    }
    if (this.shoe.needsShuffle()) {
      this.shoe.shuffle();
      g.sound("shuffle");
      this.say("The dealer shuffles up a fresh shoe.", C.gray);
    } else this.message = "";
    this.countAtBet = this.shoe.trueCount();
    this.takeMoney(this.bet);
    this.round = new BlackjackRound(this.shoe, this.rules, this.bet);
    this.round.cloverArmed = g.has("clover");
    this.peeked = !this.roller && g.has("peekring");
    g.sound("card");
    this.cursor = 0;
    this.afterAction();
  }

  private say(text: string, color: string = C.white): void {
    this.message = text;
    this.messageColor = color;
  }

  /** Moves the screen along after the round changes. */
  private afterAction(): void {
    const r = this.round;
    if (!r) return;
    const g = this.game;
    if (r.burned && g.has("clover")) {
      g.useItem("clover");
      this.say(
        `Your Four-Leaf Clover burns the ${r.burned.rank === 14 ? "ace" : "card"} that would have busted you!`,
        C.green,
      );
      g.log("Your Four-Leaf Clover saves a busted hand.", C.green);
      r.burned = null;
    }
    if (r.phase === "insurance") this.phase = "insurance";
    else if (r.phase === "play") this.phase = "play";
    else {
      this.phase = "reveal";
      this.revealAt = performance.now();
    }
  }

  private act(move: BjMove): void {
    const r = this.round;
    if (!r || this.phase !== "play") return;
    const g = this.game;
    if (move === "H") r.hit();
    else if (move === "S") r.stand();
    else if (move === "D") {
      if (!r.canDouble()) return;
      if (!this.takeMoney(r.hand.bet)) {
        this.say("Not enough money to double.", C.orange);
        return;
      }
      r.double();
    } else if (move === "P") {
      if (!r.canSplit()) return;
      if (!this.takeMoney(r.hand.bet)) {
        this.say("Not enough money to split.", C.orange);
        return;
      }
      r.split();
    }
    g.sound("card");
    this.cursor = 0;
    this.afterAction();
  }

  /** Dealer cards shown so far during the reveal. */
  private dealerShown(now: number): (Card | null)[] {
    const r = this.round;
    if (!r) return [];
    if (this.phase !== "reveal") {
      if (r.phase === "done") return r.dealer;
      return [r.dealer[0], r.holeHidden && !this.peeked ? null : r.dealer[1]];
    }
    const n = 2 + Math.floor((now - this.revealAt - animMs(300)) / animMs(450));
    if (n < 2) return [r.dealer[0], null];
    return r.dealer.slice(0, Math.min(r.dealer.length, n));
  }

  private finishRound(): void {
    const r = this.round;
    if (!r) return;
    const g = this.game;
    this.phase = "result";
    let payout = r.payout;
    if (this.roller) {
      // They can only pay what they have.
      const theirLoss = Math.min(this.theirStack, Math.max(0, r.net));
      const theirGain = Math.max(0, -r.net);
      this.theirStack += theirGain - theirLoss;
      payout = r.staked + theirLoss - (r.net < 0 ? -r.net : 0);
      this.stack += Math.max(0, payout);
      g.duelStack(this.stack);
      this.speech =
        r.net > 0 ? pick(this.roller.loseHand) : r.net < 0 ? pick(this.roller.winHand) : "";
    } else {
      g.receive(payout);
    }
    const net = this.roller ? Math.max(0, payout) - r.staked : r.net;
    if (net > 0) g.sound(r.results.some((x) => x.outcome === "blackjack") ? "bigwin" : "win");
    else if (net < 0) g.sound("lose");
    this.say(
      net > 0
        ? `You win ${money(net)}.`
        : net < 0
          ? `You lose ${money(-net)}.`
          : "Push - your money back.",
      net > 0 ? C.lime : net < 0 ? C.red : C.light,
    );
    if (this.roller) {
      this.checkDuelOver();
      return;
    }
    const table = this.table as TableDef;
    const cheat = this.peeked ? PEEK_HEAT : 0;
    const out = g.houseResult({
      table,
      bet: r.hands[0].bet / (r.hands[0].doubled ? 2 : 1),
      net: r.net,
      min: this.min,
      trueCount: this.countAtBet,
      cheat,
    });
    if (out) {
      this.finished = true;
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
    } else if (g.s.over) {
      this.leave();
    }
  }

  private checkDuelOver(): void {
    const r = this.roller as RollerDef;
    const g = this.game;
    if (this.theirStack < this.min) {
      this.finished = true;
      const total = this.stack + this.theirStack;
      g.endDuel("won", total);
      this.app.popTo(this.play);
      this.app.push(
        new NoticeScreen(
          this.app,
          "CLEANED OUT!",
          [`"${r.beaten}"`, "", `You collect ${money(total)}.`],
          C.gold,
        ),
      );
      this.play.after();
    } else if (this.stack < this.min) {
      this.finished = true;
      g.endDuel("lost", this.stack);
      this.app.popTo(this.play);
      this.app.push(
        new NoticeScreen(
          this.app,
          "BUSTED",
          [`"${r.victory}"`, "", `${r.name} takes your stake.`],
          C.red,
        ),
      );
      this.play.after();
    }
  }

  private leave(): void {
    if (this.finished) return;
    const g = this.game;
    if (this.roller) {
      const stack = this.stack;
      this.app.push(
        new ConfirmScreen(
          this.app,
          `Walk away from ${this.roller.short}'s table with ${money(stack)}?`,
          () => {
            this.finished = true;
            g.endDuel("left", stack);
            this.app.popTo(this.play);
            this.play.after();
          },
        ),
      );
      return;
    }
    this.finished = true;
    this.app.pop();
    this.play.after();
  }

  private moves(): { label: string; move: BjMove; on: boolean }[] {
    const r = this.round;
    const bank = this.bank;
    if (!r) return [];
    return [
      { label: "Hit", move: "H", on: true },
      { label: "Stand", move: "S", on: true },
      { label: "Double", move: "D", on: r.canDouble() && bank >= r.hand.bet },
      { label: "Split", move: "P", on: r.canSplit() && bank >= r.hand.bet },
    ];
  }

  key(e: KeyboardEvent): void {
    const code = e.code;
    const confirm = code === "Enter" || code === "NumpadEnter" || code === "Space";
    if (this.phase === "reveal") return;
    if (this.phase === "bet" || this.phase === "result") {
      if (code === "Escape" || code === "Backspace") {
        this.leave();
        return;
      }
      const steps: Record<string, number> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowDown: -5,
        ArrowUp: 5,
      };
      if (code in steps) {
        if (this.phase === "result") this.phase = "bet";
        this.bet += steps[code] * this.min;
        this.clampBet();
        this.game.sound("chip");
        return;
      }
      if (code === "KeyM") {
        this.bet = this.maxBet();
        return;
      }
      if (confirm || code === "KeyR") this.deal();
      return;
    }
    if (this.phase === "insurance") {
      const r = this.round as BlackjackRound;
      const cost = Math.floor(r.hands[0].bet / 2);
      if (code === "ArrowLeft" || code === "ArrowRight") this.cursor = 1 - this.cursor;
      const yes = code === "KeyY" || (confirm && this.cursor === 0);
      const no = code === "KeyN" || code === "Escape" || (confirm && this.cursor === 1);
      if (yes) {
        if (!this.takeMoney(cost)) {
          this.say("Not enough money for insurance.", C.orange);
          return;
        }
        r.decideInsurance(true);
      } else if (no) r.decideInsurance(false);
      else return;
      this.cursor = 0;
      this.afterAction();
      return;
    }
    // Playing a hand.
    const hot: Record<string, BjMove> = { KeyH: "H", KeyS: "S", KeyD: "D", KeyP: "P" };
    if (code in hot) {
      this.act(hot[code]);
      return;
    }
    const ms = this.moves();
    if (code === "ArrowLeft") this.cursor = (this.cursor + ms.length - 1) % ms.length;
    else if (code === "ArrowRight") this.cursor = (this.cursor + 1) % ms.length;
    else if (confirm) {
      const m = ms[this.cursor];
      if (m.on) this.act(m.move);
    }
  }

  animating(now: number): boolean {
    if (this.phase !== "reveal") return false;
    const r = this.round as BlackjackRound;
    if (this.dealerShown(now).length >= r.dealer.length && this.dealerShown(now).every((c) => c)) {
      const extra = r.dealer.length > 2 ? 1 : 0;
      if (now - this.revealAt > animMs(300) + animMs(450) * (r.dealer.length - 1 + extra))
        this.finishRound();
    }
    return true;
  }

  draw(t: Term, now: number): void {
    const g = this.game;
    const feltColor = this.roller ? "#1a3a2a" : (g.casino?.theme.felt ?? C.felt);
    felt(t, 0, 0, COLS, ROWS, C.black);
    felt(t, 1, 2, COLS - 2, 29, feltColor);
    for (let x = 1; x < COLS - 1; x++) {
      t.put(x, 2, "▀", C.darkGold, feltColor);
      t.put(x, 30, "▄", C.darkGold, feltColor);
    }
    const title = this.roller
      ? `BLACKJACK  vs  ${this.roller.name.toUpperCase()}`
      : `BLACKJACK  ·  ${(this.table as TableDef).label}${g.hotTable === this.table?.id ? "  ·  LUCKY HOUR" : ""}  ·  ${g.casino?.name ?? ""}`;
    t.center(0, title, this.roller ? this.roller.color : C.yellow);
    t.center(1, `${rulesText(this.rules)}  ·  Bets ${money(this.min)}-${money(this.max)}`, C.gray);

    // Dealer.
    const r = this.round;
    if (this.roller) {
      drawPortrait(t, 4, 4, this.roller.look, feltColor);
      t.text(3, 12, this.roller.short, this.roller.color, feltColor);
      t.text(3, 13, `Stack ${money(this.theirStack)}`, C.white, feltColor);
    }
    t.text(30, 4, this.roller ? `${this.roller.short} deals` : "Dealer", C.paper, feltColor);
    const shown = this.dealerShown(now);
    if (r) {
      drawHand(t, 30, 5, shown, 46);
      const known = shown.filter((c): c is Card => !!c);
      if (shown.every((c) => c))
        t.text(30, 11, `Dealer has ${bjTotal(known).total}`, C.paper, feltColor);
      else if (this.peeked && !this.roller)
        t.text(30, 11, "Your Peek Ring catches the hole card.", C.amber, feltColor);
      else t.text(30, 11, `Showing ${bjTotal(known).total}`, C.paper, feltColor);
    } else t.text(30, 6, "Place your bet.", C.paper, feltColor);
    if (this.speech && this.roller)
      t.text(18, 14, `"${this.speech}"`, this.roller.color, feltColor, 78);

    // Your hands.
    if (r) {
      const n = r.hands.length;
      const slot = Math.min(22, Math.floor(70 / n));
      r.hands.forEach((h, i) => {
        const x = 8 + i * slot;
        const active = this.phase === "play" && i === r.active;
        const tot = bjTotal(h.cards);
        t.text(
          x,
          15,
          `${active ? "► " : ""}${tot.soft && tot.total < 21 ? "Soft " : ""}${tot.total}`,
          active ? C.yellow : C.paper,
          feltColor,
        );
        drawHand(t, x, 17, h.cards, slot - 2, () => ({ lift: active }));
        t.text(x, 23, `Bet ${money(h.bet)}${h.doubled ? " (doubled)" : ""}`, C.paper, feltColor);
        const res = this.phase === "result" ? r.results[i] : undefined;
        if (res) {
          const [label, col] = OUTCOME_TEXT[res.outcome];
          t.text(x, 24, label, col, feltColor);
        }
      });
      if (r.insurance)
        t.text(
          8,
          25,
          `Insurance ${money(r.insurance)}${this.phase === "result" ? (r.insuranceReturn ? " pays!" : " lost") : ""}`,
          C.amber,
          feltColor,
        );
    }

    // Controls.
    const by = 27;
    if (this.phase === "bet" || this.phase === "result") {
      const label = `Bet ${money(this.bet)}`;
      t.text(8, by, label, C.yellow, feltColor);
      t.text(
        8 + label.length + 2,
        by,
        "←→ change  ↑↓ ×5  M max  Enter deal  Esc leave",
        C.paper,
        feltColor,
      );
    } else if (this.phase === "insurance") {
      const r2 = this.round as BlackjackRound;
      t.text(8, by - 1, "The dealer shows an ace. Insurance?", C.white, feltColor);
      buttons(
        t,
        8,
        by,
        [`Insurance (${money(Math.floor(r2.hands[0].bet / 2))})`, "No thanks"],
        this.cursor,
      );
    } else if (this.phase === "play") {
      const ms = this.moves();
      buttons(
        t,
        8,
        by,
        ms.map((m) => m.label),
        this.cursor,
        ms.map((m) => m.on),
      );
      t.text(
        8 + buttonsWidth(ms.map((m) => m.label)) + 3,
        by,
        "H S D P or ←→ Enter",
        C.paper,
        feltColor,
      );
    }
    if (this.message) t.text(8, by + 2, this.message, this.messageColor, feltColor, COLS - 2);

    // Side panel: money and counting.
    const px = 84;
    let py = 4;
    t.text(px, py++, this.roller ? "Your stack" : "Your cash", C.paper, feltColor);
    t.text(px, py++, money(this.bank), C.lime, feltColor);
    if (this.roller) t.text(px, py++, `(${money(g.s.cash)} in pocket)`, C.gray, feltColor);
    py++;
    const sense = g.skill("cards");
    if (sense >= 1 && r && this.phase === "play") {
      const book = basicStrategy(r.hand.cards, r.upCard, this.rules, r.canDouble(), r.canSplit());
      t.text(px, py++, "The book says:", C.paper, feltColor);
      t.text(px, py++, MOVE_NAME[book], C.cyan, feltColor);
      py++;
    }
    if (sense >= 2) {
      t.text(px, py++, `Running count ${signed(this.shoe.running)}`, C.cyan, feltColor);
    }
    if (sense >= 3) {
      const tc = this.shoe.trueCount();
      t.text(px, py++, `True count ${signed(tc)}`, C.cyan, feltColor);
      t.text(px, py++, `${this.shoe.decksLeft().toFixed(1)} decks left`, C.gray, feltColor);
      if (this.phase === "bet" || this.phase === "result")
        t.text(
          px,
          py++,
          tc >= 2 ? "Hot shoe: bet big!" : tc <= -1 ? "Cold shoe: bet small." : "Neutral shoe.",
          tc >= 2 ? C.lime : C.gray,
          feltColor,
        );
      if (this.phase === "insurance")
        t.text(px, py++, tc >= 3 ? "Take insurance." : "Skip insurance.", C.cyan, feltColor);
      py++;
    }
    if (!this.roller) {
      t.text(px, py++, `Heat ${g.heatHere()}`, g.heatHere() >= 70 ? C.red : C.paper, feltColor);
      if (this.table && g.watched(this.table))
        t.text(px, py++, "Pit boss watching!", C.orange, feltColor);
    }
    const lucky = [
      g.has("clover") ? ITEMS.clover.name : "",
      g.has("peekring") && !this.roller ? ITEMS.peekring.name : "",
    ].filter(Boolean);
    if (lucky.length) {
      py++;
      for (const l of lucky) t.text(px, py++, l, C.green, feltColor, COLS - 2);
    }
  }
}

const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)] ?? "";
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
