import { evalPoker } from "../../../game/cards";
import { C } from "../../../game/colors";
import type { RollerDef } from "../../../game/data/casinos";
import { MARKED_CAUGHT } from "../../../game/data/items";
import { type Game, money } from "../../../game/game";
import {
  discardAllowed,
  type PokerAction,
  type PokerHand,
  PokerMatch,
  type PokerPersona,
  type TellKind,
} from "../../../game/poker";
import type { App, Screen } from "../app";
import { animMs } from "../settings";
import { COLS, ROWS, type Term } from "../term";
import { buttons, buttonsWidth, CARD_W, drawCard, drawPortrait, felt } from "./draw";
import { ConfirmScreen, NoticeScreen } from "./menus";
import type { PlayScreen } from "./play";

type Phase = "between" | "hand" | "over";

const ACTION_LABEL: Record<PokerAction, string> = {
  check: "Check",
  bet: "Bet",
  call: "Call",
  raise: "Raise",
  fold: "Fold",
};

const TELL_MEANING: Record<TellKind, [string, string]> = {
  strong: ["(that usually means a strong hand)", C.red],
  weak: ["(that usually means a weak hand)", C.lime],
  neutral: ["(that doesn't mean much)", C.gray],
};

/** A heads-up poker duel with a high roller. */
export class PokerScreen implements Screen {
  readonly opaque = true;
  readonly music: "duel" | "boss";
  private match: PokerMatch;
  private hand: PokerHand | null = null;
  private phase: Phase = "between";
  private cursor = 0;
  private discard = new Set<number>();
  private aiAt = 0;
  private tell: TellKind | null = null;
  private tellText = "";
  private speech: string;
  private message = "";
  private messageColor: string = C.white;
  private marked = false;
  private finished = false;

  constructor(
    private app: App,
    private play: PlayScreen,
    private r: RollerDef,
  ) {
    const g = this.game;
    const p = r.persona as PokerPersona;
    const persona = { ...p, face: Math.max(0, Math.min(1, p.face + g.faceBonus)) };
    this.match = new PokerMatch(g.rng, r.stake, persona, g.skill("face"));
    this.speech = r.challenge;
    this.music = r.boss ? "boss" : "duel";
  }

  get game(): Game {
    return this.app.game as Game;
  }

  private betweenOptions(): { label: string; act: () => void }[] {
    const g = this.game;
    const out = [{ label: "Deal", act: () => this.deal(false) }];
    if (g.has("markeddeck"))
      out.push({ label: "Deal with the Marked Deck", act: () => this.deal(true) });
    out.push({ label: "Walk away", act: () => this.leave() });
    return out;
  }

  private deal(marked: boolean): void {
    const g = this.game;
    this.marked = false;
    if (marked) {
      g.useItem("markeddeck");
      if (g.rng.chance(MARKED_CAUGHT)) {
        this.finished = true;
        g.endDuel(
          "lost",
          0,
          `${this.r.name} catches you with a marked deck! You forfeit your whole stack.`,
        );
        this.app.popTo(this.play);
        this.app.push(
          new NoticeScreen(
            this.app,
            "CAUGHT CHEATING",
            [
              `${this.r.short} spots the marks on the deck.`,
              '"Get out. And leave the money."',
              "",
              "You forfeit your stack.",
            ],
            C.red,
          ),
        );
        this.play.after();
        return;
      }
      this.marked = true;
      g.log("You slip the marked deck into play. Nobody notices.", C.amber);
    }
    this.hand = this.match.newHand();
    this.phase = "hand";
    this.discard.clear();
    this.cursor = 0;
    this.message = "";
    this.speech = "";
    g.sound("shuffle");
    this.readTell();
    this.queueAi();
  }

  private readTell(): void {
    const h = this.hand;
    if (!h) return;
    const g = this.game;
    this.tell = h.tell(g.skill("read"), g.knowsTell(this.r.id), g.rng);
    const lines = this.r.tells?.[this.tell] ?? ["sits still"];
    this.tellText = lines[Math.floor(g.rng.next() * lines.length)];
  }

  private queueAi(): void {
    if (this.hand && this.hand.phase !== "done" && this.hand.toAct === "them")
      this.aiAt = performance.now() + animMs(750);
  }

  private aiMove(): void {
    const h = this.hand;
    if (h?.toAct !== "them" || h.phase === "done") return;
    const g = this.game;
    if (h.phase === "draw") {
      h.draw("them", h.aiDiscards());
      g.sound("card");
      this.readTell();
    } else {
      const a = h.aiAction();
      h.act(a);
      g.sound(a === "fold" ? "card" : a === "check" ? "tick" : "chip");
    }
    this.afterAction();
  }

  private afterAction(): void {
    const h = this.hand;
    if (!h) return;
    this.cursor = 0;
    if (h.phase === "done") this.endHand();
    else this.queueAi();
  }

  private youAct(a: PokerAction): void {
    const h = this.hand;
    if (h?.toAct !== "you" || !h.options().includes(a)) return;
    h.act(a);
    this.game.sound(a === "fold" ? "card" : a === "check" ? "tick" : "chip");
    this.afterAction();
  }

  private youDraw(): void {
    const h = this.hand;
    if (h?.phase !== "draw" || h.toAct !== "you") return;
    const d = [...this.discard];
    if (!discardAllowed(h.cards.you, d)) {
      this.message = "You can draw three cards, or four if the card you keep is an ace.";
      this.messageColor = C.orange;
      this.game.sound("deny");
      return;
    }
    h.draw("you", d);
    this.discard.clear();
    this.message = "";
    this.game.sound("card");
    this.afterAction();
  }

  private endHand(): void {
    const h = this.hand as PokerHand;
    const g = this.game;
    this.match.finishHand();
    g.duelStack(this.match.stacks.you);
    const won = h.winner === "you";
    if (h.winner === "split") {
      this.message = "Split pot.";
      this.messageColor = C.light;
    } else if (h.folded) {
      this.message = won
        ? `${this.r.short} folds. You take ${money(h.won.you)}.`
        : `You fold. ${this.r.short} takes the pot.`;
      this.messageColor = won ? C.lime : C.gray;
    } else {
      const yours = evalPoker(h.cards.you).name;
      const theirs = evalPoker(h.cards.them).name;
      this.message = won
        ? `Your ${yours} beats ${theirs}. You win ${money(h.won.you)}!`
        : `${this.r.short}'s ${theirs} beats your ${yours}.`;
      this.messageColor = won ? C.lime : C.red;
    }
    this.speech = won ? pick(this.r.loseHand) : h.winner === "them" ? pick(this.r.winHand) : "";
    g.sound(won ? "win" : h.winner === "them" ? "lose" : "chip");
    this.phase = "between";
    this.cursor = 0;
    const winner = this.match.winner();
    if (winner) {
      this.finished = true;
      this.phase = "over";
      const total = this.match.stacks.you;
      if (winner === "you") {
        g.endDuel("won", total);
        this.app.popTo(this.play);
        this.app.push(
          new NoticeScreen(
            this.app,
            "CLEANED OUT!",
            [`"${this.r.beaten}"`, "", `You collect ${money(total)}.`],
            C.gold,
          ),
        );
      } else {
        g.endDuel("lost", 0);
        this.app.popTo(this.play);
        this.app.push(
          new NoticeScreen(
            this.app,
            "BUSTED",
            [`"${this.r.victory}"`, "", `${this.r.name} takes your stake.`],
            C.red,
          ),
        );
      }
      this.play.after();
    }
  }

  private leave(): void {
    if (this.finished) return;
    const stack = this.match.stacks.you;
    this.app.push(
      new ConfirmScreen(
        this.app,
        `Walk away from ${this.r.short}'s table with ${money(stack)}?`,
        () => {
          this.finished = true;
          this.game.endDuel("left", stack);
          this.app.popTo(this.play);
          this.play.after();
        },
      ),
    );
  }

  key(e: KeyboardEvent): void {
    const code = e.code;
    const confirm = code === "Enter" || code === "NumpadEnter" || code === "Space";
    if (this.phase === "between") {
      const opts = this.betweenOptions();
      if (code === "ArrowLeft") this.cursor = (this.cursor + opts.length - 1) % opts.length;
      else if (code === "ArrowRight") this.cursor = (this.cursor + 1) % opts.length;
      else if (code === "Escape") this.leave();
      else if (code === "KeyR") this.deal(false);
      else if (confirm) opts[Math.min(this.cursor, opts.length - 1)].act();
      return;
    }
    const h = this.hand;
    if (!h || this.phase !== "hand" || h.toAct !== "you") return;
    if (h.phase === "draw") {
      const digit = /^(Digit|Numpad)([1-5])$/.exec(code);
      if (digit) this.toggle(Number(digit[2]) - 1);
      else if (code === "ArrowLeft") this.cursor = (this.cursor + 5) % 6;
      else if (code === "ArrowRight") this.cursor = (this.cursor + 1) % 6;
      else if (code === "ArrowUp" && this.cursor < 5) this.toggle(this.cursor);
      else if (code === "KeyD" || code === "KeyR") this.youDraw();
      else if (confirm) {
        if (this.cursor === 5) this.youDraw();
        else this.toggle(this.cursor);
      }
      return;
    }
    const opts = h.options();
    const hot: Record<string, PokerAction[]> = {
      KeyC: ["check", "call"],
      KeyB: ["bet", "raise"],
      KeyF: ["fold"],
    };
    if (code in hot) {
      const a = hot[code].find((x) => opts.includes(x));
      if (a) this.youAct(a);
      return;
    }
    if (code === "ArrowLeft") this.cursor = (this.cursor + opts.length - 1) % opts.length;
    else if (code === "ArrowRight") this.cursor = (this.cursor + 1) % opts.length;
    else if (confirm) this.youAct(opts[Math.min(this.cursor, opts.length - 1)]);
  }

  private toggle(i: number): void {
    if (this.discard.has(i)) this.discard.delete(i);
    else this.discard.add(i);
    this.game.sound("tick");
  }

  animating(now: number): boolean {
    if (this.aiAt && now >= this.aiAt) {
      this.aiAt = 0;
      this.aiMove();
    }
    return this.aiAt > 0;
  }

  draw(t: Term): void {
    const g = this.game;
    const r = this.r;
    const h = this.hand;
    const feltColor = "#3a1420";
    felt(t, 0, 0, COLS, ROWS, C.black);
    felt(t, 1, 2, COLS - 2, 29, feltColor);
    for (let x = 1; x < COLS - 1; x++) {
      t.put(x, 2, "▀", C.darkGold, feltColor);
      t.put(x, 30, "▄", C.darkGold, feltColor);
    }
    const l = this.match.limits;
    t.center(0, `FIVE-CARD DRAW  vs  ${r.name.toUpperCase()}`, r.color);
    t.center(
      1,
      `Ante ${money(l.ante)}  ·  Bets ${money(l.small)} before the draw, ${money(l.big)} after  ·  Up to 3 raises a round`,
      C.gray,
    );

    // Them.
    drawPortrait(t, 4, 4, r.look, feltColor);
    t.text(3, 12, r.short, r.color, feltColor);
    t.text(
      3,
      13,
      `Stack ${money(h && h.phase !== "done" ? h.stacks.them : this.match.stacks.them)}`,
      C.white,
      feltColor,
    );
    const showThem = !!h && (h.showdownHappened || this.marked);
    if (h) {
      h.cards.them.forEach((c, i) => {
        drawCard(t, 22 + i * (CARD_W + 1), 4, showThem ? c : null, {
          dim: this.marked && !h.showdownHappened,
        });
      });
      if (h.showdownHappened) t.text(22, 10, evalPoker(h.cards.them).name, C.white, feltColor);
      else if (this.marked)
        t.text(22, 10, `Marked: ${evalPoker(h.cards.them).name}`, C.amber, feltColor);
      if (h.drew.them !== null)
        t.text(64, 5, h.drew.them === 0 ? "Stood pat" : `Drew ${h.drew.them}`, C.paper, feltColor);
      if (h.committed.them > 0)
        t.text(64, 7, `Bet ${money(h.committed.them)}`, C.yellow, feltColor);
    }
    if (h && h.phase !== "done" && this.tell) {
      const known = g.knowsTell(r.id);
      t.text(18, 12, `${r.short} ${this.tellText}.`, C.white, feltColor);
      if (g.skill("read") >= 1 || known) {
        const [meaning, col] = TELL_MEANING[this.tell];
        t.text(18, 13, meaning + (known ? " - you know this tell" : ""), col, feltColor);
      }
    }
    if (this.speech) t.text(18, 14, `"${this.speech}"`, r.color, feltColor, 80);

    // Pot.
    if (h) {
      const pot = h.pot;
      t.text(64, 11, pot ? `POT ${money(pot)}` : "", C.gold, feltColor);
    }

    // You.
    if (h) {
      const drawing = h.phase === "draw" && h.toAct === "you";
      h.cards.you.forEach((c, i) => {
        const x = 22 + i * (CARD_W + 1);
        const out = this.discard.has(i);
        drawCard(t, x, 17, c, { lift: drawing && this.cursor === i, dim: out });
        if (out) t.text(x, 22, "  OUT  ", C.red, feltColor);
        if (drawing)
          t.text(
            x + 3,
            23,
            String(i + 1),
            drawing && this.cursor === i ? C.yellow : C.gray,
            feltColor,
          );
      });
      t.text(22, 16, evalPoker(h.cards.you).name, C.paper, feltColor);
      if (h.drew.you !== null)
        t.text(
          64,
          18,
          h.drew.you === 0 ? "You stood pat" : `You drew ${h.drew.you}`,
          C.paper,
          feltColor,
        );
      if (h.committed.you > 0)
        t.text(64, 20, `Your bet ${money(h.committed.you)}`, C.yellow, feltColor);
    }
    t.text(3, 17, "You", C.yellow, feltColor);
    t.text(
      3,
      18,
      `Stack ${money(h && h.phase !== "done" ? h.stacks.you : this.match.stacks.you)}`,
      C.white,
      feltColor,
    );

    // Controls.
    const by = 26;
    if (this.phase === "between") {
      const opts = this.betweenOptions();
      buttons(
        t,
        22,
        by,
        opts.map((o) => o.label),
        Math.min(this.cursor, opts.length - 1),
      );
    } else if (h && h.phase !== "done") {
      if (h.toAct !== "you") t.text(22, by, `${r.short} is thinking...`, C.gray, feltColor);
      else if (h.phase === "draw") {
        const labels = ["1", "2", "3", "4", "5", `Draw ${this.discard.size}`];
        buttons(t, 22, by, labels, this.cursor);
        t.text(
          22 + buttonsWidth(labels) + 3,
          by,
          "1-5 or Enter: pick cards to throw away",
          C.paper,
          feltColor,
        );
      } else {
        const opts = h.options();
        const labels = opts.map((a) => {
          const amount =
            a === "call"
              ? h.toCall("you")
              : a === "bet" || a === "raise"
                ? h.toCall("you") + h.betSize()
                : 0;
          return amount
            ? `${ACTION_LABEL[a]} ${money(Math.min(amount, h.stacks.you))}`
            : ACTION_LABEL[a];
        });
        buttons(t, 22, by, labels, Math.min(this.cursor, opts.length - 1));
        t.text(
          22 + buttonsWidth(labels) + 3,
          by,
          "C check/call  B bet/raise  F fold",
          C.paper,
          feltColor,
        );
      }
    }
    if (this.message) t.text(22, by + 2, this.message, this.messageColor, feltColor, COLS - 2);

    // What happened this hand.
    const px = 84;
    t.text(px, 4, "This hand", C.paper, feltColor);
    const events = h?.events.slice(-12) ?? [];
    events.forEach((ev, i) => {
      t.text(
        px,
        5 + i,
        `${ev.who === "you" ? "You" : r.short} ${ev.text}`,
        ev.who === "you" ? C.yellow : r.color,
        feltColor,
        COLS - 2,
      );
    });
    t.text(px, 22, `Pocket ${money(g.s.cash)}`, C.gray, feltColor);
    t.text(px, 23, `Poker Read ${g.skill("read")}  Face ${g.skill("face")}`, C.gray, feltColor);
    if (this.match.suspicion > 0) t.text(px, 24, `${r.short} suspects bluffs`, C.orange, feltColor);
  }
}

const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)] ?? "";
