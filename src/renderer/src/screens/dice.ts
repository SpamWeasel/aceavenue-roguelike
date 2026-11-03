import { C } from "../../../game/colors";
import type { RollerDef } from "../../../game/data/casinos";
import { ITEMS, MARKED_CAUGHT } from "../../../game/data/items";
import { type Game, money } from "../../../game/game";
import {
  type Bid,
  beats,
  bidText,
  countFace,
  DICE_EACH,
  DiceMatch,
  type DiceRound,
  minQty,
} from "../../../game/liarsdice";
import type { PokerPersona, TellKind } from "../../../game/poker";
import type { App, Screen } from "../app";
import { animMs } from "../settings";
import { COLS, ROWS, type Term } from "../term";
import { buttons, buttonsWidth, DIE_W, drawDie, drawPortrait, felt, wrapLines } from "./draw";
import { ConfirmScreen, NoticeScreen } from "./menus";
import type { PlayScreen } from "./play";

type Phase = "between" | "round" | "over";

const TELL_MEANING: Record<TellKind, [string, string]> = {
  strong: ["(that usually means the bid is good)", C.red],
  weak: ["(that usually means a bluff)", C.lime],
  neutral: ["(that doesn't mean much)", C.gray],
};

const FACE_WORD = ["", "ones", "twos", "threes", "fours", "fives", "sixes"];

/** A heads-up liar's dice duel with a high roller. */
export class DiceScreen implements Screen {
  readonly opaque = true;
  readonly music: "duel" | "boss";
  private match: DiceMatch;
  private round: DiceRound | null = null;
  private phase: Phase = "between";
  private cursor = 0;
  private sel: Bid = { qty: 1, face: 2 };
  private aiAt = 0;
  private tell: TellKind | null = null;
  private tellText = "";
  private speech: string;
  private message = "";
  private messageColor: string = C.white;
  private loaded = false;
  private finished = false;

  constructor(
    private app: App,
    private play: PlayScreen,
    private r: RollerDef,
  ) {
    const g = this.game;
    const p = r.persona as PokerPersona;
    const persona = { ...p, face: Math.max(0, Math.min(1, p.face + g.faceBonus)) };
    this.match = new DiceMatch(g.rng, r.stake, persona, g.skill("face"));
    this.speech = r.challenge;
    this.music = r.boss ? "boss" : "duel";
    this.message = `${this.match.opener === "you" ? "You open" : `${r.short} opens`} the first round.`;
  }

  get game(): Game {
    return this.app.game as Game;
  }

  private betweenOptions(): { label: string; act: () => void }[] {
    const g = this.game;
    const out = [{ label: "Roll", act: () => this.roll(false) }];
    if (g.has("loadeddice"))
      out.push({ label: "Roll the Loaded Dice", act: () => this.roll(true) });
    out.push({ label: "Walk away", act: () => this.leave() });
    return out;
  }

  private roll(loaded: boolean): void {
    const g = this.game;
    this.loaded = false;
    if (loaded) {
      g.useItem("loadeddice");
      if (g.rng.chance(MARKED_CAUGHT)) {
        this.finished = true;
        g.endDuel(
          "lost",
          0,
          `${this.r.name} catches you with loaded dice! You forfeit your whole stake.`,
        );
        this.app.popTo(this.play);
        this.app.push(
          new NoticeScreen(
            this.app,
            "CAUGHT CHEATING",
            [
              `${this.r.short} picks up one of your dice and weighs it.`,
              '"Heavy. Get off my table. Leave the money."',
              "",
              "You forfeit your stake.",
            ],
            C.red,
          ),
        );
        this.play.after();
        return;
      }
      this.loaded = true;
      g.log("You palm the loaded dice into your cup. Nobody notices.", C.amber);
    }
    this.round = this.match.newRound(this.loaded);
    this.phase = "round";
    this.tell = null;
    this.speech = "";
    this.message = "";
    this.cursor = 0;
    g.sound("dice");
    this.startTurn();
  }

  /** Sets up whoever's turn it is. */
  private startTurn(): void {
    const rd = this.round;
    if (!rd || rd.done) return;
    if (rd.toAct === "them") {
      this.aiAt = performance.now() + animMs(900);
      return;
    }
    // Start the bid picker on your best face, at the smallest legal bid.
    let face = 2;
    for (let f = 3; f <= 6; f++)
      if (countFace(rd.dice.you, f) >= countFace(rd.dice.you, face)) face = f;
    const last = rd.last;
    if (last && countFace(rd.dice.you, face) <= countFace(rd.dice.you, last.face)) face = last.face;
    this.sel = { face, qty: minQty(face, last) };
    this.fixSel();
  }

  /** Keeps the picked bid legal. */
  private fixSel(): void {
    const rd = this.round;
    if (!rd) return;
    const s = this.sel;
    s.face = Math.max(2, Math.min(6, s.face));
    s.qty = Math.max(minQty(s.face, rd.last), Math.min(rd.total, s.qty));
  }

  private aiMove(): void {
    const rd = this.round;
    if (!rd || rd.done || rd.toAct !== "them") return;
    const g = this.game;
    const m = rd.aiMove();
    if (m.kind === "call") {
      this.lift("them");
      return;
    }
    rd.bid("them", m.bid);
    g.sound("dice");
    this.tell = rd.tell(g.skill("read"), g.knowsTell(this.r.id), g.rng);
    const lines = this.r.tells?.[this.tell] ?? ["sits still"];
    this.tellText = lines[Math.floor(g.rng.next() * lines.length)];
    this.startTurn();
  }

  private youBid(): void {
    const rd = this.round;
    if (!rd || rd.done || rd.toAct !== "you") return;
    if (!beats(this.sel, rd.last) || this.sel.qty > rd.total) {
      this.say("That bid has to beat the last one.", C.orange);
      this.game.sound("deny");
      return;
    }
    rd.bid("you", this.sel);
    this.tell = null;
    this.message = "";
    this.game.sound("dice");
    this.startTurn();
  }

  private youCall(): void {
    const rd = this.round;
    if (!rd || rd.done || rd.toAct !== "you") return;
    if (!rd.last) {
      this.say("Somebody has to bid before you can call it a lie.", C.orange);
      this.game.sound("deny");
      return;
    }
    this.lift("you");
  }

  /** "Liar!" Up come the cups. */
  private lift(caller: "you" | "them"): void {
    const rd = this.round as DiceRound;
    const g = this.game;
    const rv = rd.call(caller);
    if (!rv) return;
    this.match.finishRound();
    g.duelStack(this.match.yourStack);
    const who = caller === "you" ? "You call" : `${this.r.short} calls`;
    const there = `${rv.count} ${rv.count === 1 ? "die" : "dice"} for ${FACE_WORD[rv.bid.face]}, ones included`;
    const held = rv.count >= rv.bid.qty;
    const youLost = rv.loser === "you";
    this.say(
      `${who} "Liar!" on ${bidText(rv.bid)}. There ${rv.count === 1 ? "is" : "are"} ${there}: the bid ${held ? "holds" : "was a lie"}. ${youLost ? "You lose a die." : `${this.r.short} loses a die.`}`,
      youLost ? C.red : C.lime,
    );
    this.speech = youLost ? pick(this.r.winHand) : pick(this.r.loseHand);
    this.tell = null;
    g.sound(youLost ? "lose" : "win");
    this.phase = "between";
    this.cursor = 0;
    const winner = this.match.winner();
    if (!winner) return;
    this.finished = true;
    this.phase = "over";
    const total = this.match.yourStack;
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

  private say(text: string, color: string = C.white): void {
    this.message = text;
    this.messageColor = color;
  }

  private leave(): void {
    if (this.finished) return;
    const stack = this.match.yourStack;
    this.app.push(
      new ConfirmScreen(
        this.app,
        `Walk away from ${this.r.short}'s table? Your ${this.match.counts.you} dice are worth ${money(stack)}.`,
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
      else if (code === "KeyR") this.roll(false);
      else if (confirm) opts[Math.min(this.cursor, opts.length - 1)].act();
      return;
    }
    const rd = this.round;
    if (!rd || rd.done || rd.toAct !== "you") return;
    const s = this.sel;
    if (code === "ArrowUp" || code === "Numpad8") s.qty++;
    else if (code === "ArrowDown" || code === "Numpad2") s.qty--;
    else if (code === "ArrowRight" || code === "Numpad6") s.face = s.face >= 6 ? 2 : s.face + 1;
    else if (code === "ArrowLeft" || code === "Numpad4") s.face = s.face <= 2 ? 6 : s.face - 1;
    else if (/^(Digit|Numpad)[2-6]$/.test(code)) s.face = Number(code.slice(-1));
    else if (code === "KeyL" || code === "KeyC") {
      this.youCall();
      return;
    } else if (code === "KeyB" || confirm) {
      this.youBid();
      return;
    } else return;
    this.fixSel();
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
    const rd = this.round;
    const feltColor = "#2a1a0e";
    felt(t, 0, 0, COLS, ROWS, C.black);
    felt(t, 1, 2, COLS - 2, 29, feltColor);
    for (let x = 1; x < COLS - 1; x++) {
      t.put(x, 2, "▀", C.darkGold, feltColor);
      t.put(x, 30, "▄", C.darkGold, feltColor);
    }
    t.center(0, `LIAR'S DICE  vs  ${r.name.toUpperCase()}`, r.color);
    t.center(
      1,
      `Five dice each  ·  Ones are wild  ·  Wrong side of a "Liar!" loses a die  ·  Last with dice takes ${money(r.stake * 2)}`,
      C.gray,
    );
    const shown = rd?.done ?? false;
    // What counts toward the bid on the table.
    const face =
      rd?.reveal?.bid.face ?? (rd?.toAct === "you" && !rd.done ? this.sel.face : rd?.last?.face);
    const counts = (d: number) => face !== undefined && (d === face || d === 1);

    // Them.
    drawPortrait(t, 4, 4, r.look, feltColor);
    t.text(3, 12, r.short, r.color, feltColor);
    this.diceLeft(t, 3, 13, this.match.counts.them);
    const peek = g.has("tarot");
    const theirs = rd?.dice.them ?? Array.from({ length: this.match.counts.them }, () => 0);
    theirs.forEach((d, i) => {
      const x = 22 + i * (DIE_W + 1);
      const visible = shown || (peek && i === 0 && !!rd);
      drawDie(t, x, 4, visible && d ? d : null, {
        hot: shown && counts(d),
        dim: shown && !counts(d),
      });
      if (!shown && visible && d) t.text(x, 9, " Fool ¶ ", C.purple, feltColor);
    });
    if (rd && !rd.done && this.tell) {
      const known = g.knowsTell(r.id);
      t.text(22, 12, `${r.short} ${this.tellText}.`, C.white, feltColor);
      if (g.skill("read") >= 1 || known) {
        const [meaning, col] = TELL_MEANING[this.tell];
        t.text(22, 13, meaning + (known ? " - you know this tell" : ""), col, feltColor);
      }
    }
    if (this.speech) t.text(22, 14, `"${this.speech}"`, r.color, feltColor, 80);

    // The bid.
    if (rd?.last) {
      const by = rd.lastBidder === "you" ? "your bid" : `${r.short}'s bid`;
      let x = t.text(22, 11, `ON THE TABLE: ${bidText(rd.last).toUpperCase()}`, C.gold, feltColor);
      x = t.text(x, 11, ` (${by})`, C.paper, feltColor);
      if (g.skill("cards") >= 1 && !rd.done)
        t.text(
          x + 3,
          11,
          `Odds it's good: ${Math.round(rd.yourOdds(rd.last) * 100)}%`,
          C.cyan,
          feltColor,
        );
    } else if (rd && !rd.done)
      t.text(
        22,
        11,
        `${rd.toAct === "you" ? "You open" : `${r.short} opens`} the bidding.`,
        C.paper,
        feltColor,
      );

    // You.
    t.text(3, 17, "You", C.yellow, feltColor);
    this.diceLeft(t, 3, 18, this.match.counts.you);
    t.text(3, 19, `Worth ${money(this.match.yourStack)}`, C.gray, feltColor);
    if (rd) {
      rd.dice.you.forEach((d, i) => {
        drawDie(t, 22 + i * (DIE_W + 1), 17, d, { hot: counts(d) });
      });
      if (face !== undefined)
        t.text(
          22,
          23,
          `You have ${countFace(rd.dice.you, face)} for ${FACE_WORD[face]} (ones count)${this.loaded ? "  ·  loaded!" : ""}`,
          C.paper,
          feltColor,
        );
    } else
      for (let i = 0; i < this.match.counts.you; i++) drawDie(t, 22 + i * (DIE_W + 1), 17, null);

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
    } else if (rd && !rd.done) {
      if (rd.toAct !== "you") t.text(22, by, `${r.short} is thinking...`, C.gray, feltColor);
      else {
        const labels = [`Bid ${bidText(this.sel)}`, 'Call "Liar!"'];
        buttons(t, 22, by, labels, 0, [true, !!rd.last]);
        t.text(
          22 + buttonsWidth(labels) + 3,
          by,
          "↑↓ how many  ←→ or 2-6 which face  Enter bid  L liar",
          C.paper,
          feltColor,
        );
        if (g.skill("cards") >= 1)
          t.text(
            22,
            by + 1,
            `Odds your bid is good: ${Math.round(rd.yourOdds(this.sel) * 100)}%`,
            C.cyan,
            feltColor,
          );
      }
    }
    wrapLines(this.message, COLS - 25)
      .slice(0, 2)
      .forEach((l, i) => {
        t.text(22, by + 2 + i, l, this.messageColor, feltColor);
      });

    // This round.
    const px = 84;
    t.text(px, 4, "This round", C.paper, feltColor);
    const events = rd?.events.slice(-14) ?? [];
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
    t.text(px, 21, `Pocket ${money(g.s.cash)}`, C.gray, feltColor);
    t.text(px, 22, `Poker Read ${g.skill("read")}  Face ${g.skill("face")}`, C.gray, feltColor);
    if (g.skill("cards") >= 1) t.text(px, 23, "Card Sense: odds shown", C.gray, feltColor);
    if (peek) t.text(px, 24, `${ITEMS.tarot.name}: 1 die seen`, C.purple, feltColor);
    if (this.match.suspicion > 0)
      t.text(px, 25, `${r.short} doubts your bids`, C.orange, feltColor);
  }

  private diceLeft(t: Term, x: number, y: number, n: number): void {
    for (let i = 0; i < DICE_EACH; i++)
      t.put(x + i * 2, y, i < n ? "■" : "□", i < n ? C.paper : C.dim, "#2a1a0e");
  }
}

const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)] ?? "";
