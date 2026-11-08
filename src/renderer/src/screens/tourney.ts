import { basicStrategy, MOVE_NAME } from "../../../game/blackjack";
import { bjTotal, isBlackjack } from "../../../game/cards";
import { C } from "../../../game/colors";
import { PRIZES, type TStyle } from "../../../game/data/tourney";
import { type Game, money, ordinal } from "../../../game/game";
import { TOURNEY_RULES, type Tournament, type TSeat } from "../../../game/tournament";
import type { App, Screen } from "../app";
import { isBack, isConfirm } from "../input";
import { animMs } from "../settings";
import { COLS, ROWS, type Term } from "../term";
import { buttons, buttonsWidth, drawHand, felt, wrapLines } from "./draw";
import { ConfirmScreen, NoticeScreen } from "./menus";
import type { PlayScreen } from "./play";

const STYLE_TEXT: Record<TStyle, string> = {
  cautious: "plays it safe",
  steady: "steady",
  wild: "bets big",
};

const OUTCOME_TEXT: Record<string, [string, string]> = {
  blackjack: ["BLACKJACK", C.gold],
  win: ["WIN", C.lime],
  push: ["PUSH", C.light],
  lose: ["LOSE", C.red],
  bust: ["BUST", C.red],
};

const chips = (n: number) => `${n.toLocaleString("en-US")} chips`;

/** The sign-up desk at the tournament table. */
export class TourneyDeskScreen implements Screen {
  private cursor = 0;
  private message = "";

  constructor(
    private app: App,
    private play: PlayScreen,
  ) {}

  private get game(): Game {
    return this.app.game as Game;
  }

  key(e: KeyboardEvent): void {
    const g = this.game;
    if (e.code === "ArrowUp" || e.code === "ArrowDown") this.cursor = 1 - this.cursor;
    else if (isBack(e)) this.app.pop();
    else if (isConfirm(e)) {
      if (this.cursor === 1) {
        this.app.pop();
        return;
      }
      const t = g.startTourney();
      if (typeof t === "string") {
        this.message = t;
        this.app.sound("deny");
        return;
      }
      this.app.pop();
      this.app.push(new TourneyScreen(this.app, this.play, t));
    }
  }

  draw(t: Term): void {
    const g = this.game;
    const c = g.casino;
    const w = 78;
    const x = Math.floor((COLS - w) / 2);
    const y = 6;
    const h = 24;
    t.box(x, y, w, h, C.gold, "TOURNAMENT NIGHT", C.gold);
    const fee = g.tourneyFee;
    let yy = y + 2;
    t.text(x + 3, yy++, `${c?.name ?? ""} - blackjack tournament, one a night.`, C.white);
    yy++;
    for (const l of wrapLines(
      "Five players, one dealer. Everyone starts with 1,000 tournament chips and plays ten hands; whoever has the most chips at the end wins. You're playing the table, not the house: watch the others' stacks and bet to beat them. Bets 10 to 500. No splits, no insurance.",
      w - 6,
    ))
      t.text(x + 3, yy++, l, C.light);
    yy++;
    t.text(x + 3, yy, "Entry", C.gray);
    t.text(x + 12, yy++, money(fee), g.s.cash >= fee ? C.lime : C.red);
    t.text(x + 3, yy, "Prizes", C.gray);
    t.text(
      x + 12,
      yy++,
      `1st ${money(fee * PRIZES[0])}   2nd ${money(fee * PRIZES[1])}   and a trophy for first`,
      C.gold,
    );
    yy++;
    t.text(x + 3, yy++, "Tonight's field", C.yellow);
    for (const e of g.tourneyField()) {
      t.put(x + 5, yy, e.glyph, e.color);
      t.text(x + 7, yy, e.name, e.color);
      t.text(x + 36, yy++, STYLE_TEXT[e.style], C.gray);
    }
    yy++;
    if (c && g.s.trophies.includes(c.id))
      t.text(x + 3, yy, "♛ You've already won the trophy here.", C.gold);
    const closed = g.tourneyClosed();
    const opts = [closed ? "Sign up (closed)" : `Sign up for ${money(fee)}`, "Leave"];
    opts.forEach((o, i) => {
      const sel = i === this.cursor;
      t.text(
        x + 3,
        y + h - 5 + i,
        `${sel ? "►" : " "} ${o}`,
        sel ? (i === 0 && closed ? C.gray : C.yellow) : C.light,
      );
    });
    const note = this.message || closed || "";
    if (note) t.text(x + 3, y + h - 2, note, C.orange, undefined, x + w - 2);
  }
}

/** The tournament table itself. */
export class TourneyScreen implements Screen {
  readonly opaque = true;
  readonly music = "duel" as const;
  private bet: number;
  private cursor = 0;
  private aiAt = 0;
  private message = "Place your bet. ←→ change it by 10, ↑↓ by 100, Enter to bet.";
  private messageColor: string = C.white;
  private speech = new Map<TSeat, string>();
  private finished = false;

  constructor(
    private app: App,
    private play: PlayScreen,
    private t: Tournament,
  ) {
    this.bet = 50;
  }

  private get game(): Game {
    return this.app.game as Game;
  }

  private say(text: string, color: string = C.white): void {
    this.message = text;
    this.messageColor = color;
  }

  private placeBet(): void {
    const t = this.t;
    const err = t.bet(this.bet);
    if (err) {
      this.say(err, C.orange);
      this.game.sound("deny");
      return;
    }
    this.speech.clear();
    this.game.sound("card");
    this.say("");
    this.afterMove();
  }

  /** After any move: queue the next computer player, or wrap up the hand. */
  private afterMove(): void {
    const t = this.t;
    const s = t.current();
    if (s && !s.you) {
      this.aiAt = performance.now() + animMs(450);
      return;
    }
    if (s?.you) {
      this.cursor = 0;
      return;
    }
    if (t.phase === "done") this.handDone();
  }

  private handDone(): void {
    const t = this.t;
    const g = this.game;
    const you = t.you;
    for (const s of t.playing)
      if (!s.you) {
        const won = s.result === "win" || s.result === "blackjack";
        const lines = won ? s.e.win : s.result === "push" ? [] : s.e.lose;
        if (lines.length && g.rng.chance(won ? 0.4 : 0.3))
          this.speech.set(s, lines[Math.floor(g.rng.next() * lines.length)]);
      }
    if (you.out) this.say("You're watching this one.", C.gray);
    else if (you.net > 0) {
      this.say(`You win ${chips(you.net)}.`, C.lime);
      g.sound(you.result === "blackjack" ? "bigwin" : "win");
    } else if (you.net < 0) {
      this.say(`You lose ${chips(-you.net)}.`, C.red);
      g.sound("lose");
    } else this.say("Push.", C.light);
    const last = t.hand >= t.opts.hands;
    this.message += last
      ? "  That was the last hand. Enter to see who won."
      : "  Enter: next hand.";
  }

  private next(): void {
    const t = this.t;
    t.nextHand();
    if (t.phase === "over" || t.you.out) {
      if (t.phase !== "over") t.playOut();
      this.finish();
      return;
    }
    this.bet = Math.min(this.bet, t.maxBet(t.you));
    this.speech.clear();
    const left = t.handsLeft;
    this.say(
      left === 1
        ? "LAST HAND! Bet what you need to finish on top."
        : `${left} hands to go. Place your bet.`,
      left <= 3 ? C.yellow : C.white,
    );
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    const t = this.t;
    const g = this.game;
    const r = g.endTourney(t);
    const lines = t
      .standings()
      .map(
        (s) =>
          `${ordinal(t.place(s))}  ${s.you ? "You" : s.e.name}  ${chips(s.chips)}${s.you ? "  ◄" : ""}`,
      );
    lines.push("");
    lines.push(
      r.prize > 0
        ? `You win ${money(r.prize)}!${r.trophy ? " And a little gold trophy." : ""}`
        : "No prize this time.",
    );
    this.app.popTo(this.play);
    this.app.push(
      new NoticeScreen(
        this.app,
        r.place === 1 ? "TOURNAMENT CHAMPION!" : "TOURNAMENT OVER",
        lines,
        r.place === 1 ? C.gold : r.prize > 0 ? C.lime : C.gray,
      ),
    );
    this.play.after();
  }

  private leave(): void {
    if (this.finished) return;
    this.app.push(
      new ConfirmScreen(this.app, "Leave the tournament? You forfeit your entry fee.", () => {
        // The others finish without you; your chips are forfeit.
        const t = this.t;
        t.you.out = true;
        t.playOut();
        t.you.chips = 0;
        this.finish();
      }),
    );
  }

  private youAct(move: "H" | "S" | "D"): void {
    const t = this.t;
    const s = t.current();
    if (!s?.you) return;
    if (move === "D" && !t.canDouble(s)) {
      this.say("You can only double on your first two cards, with chips to cover it.", C.orange);
      this.game.sound("deny");
      return;
    }
    t.act(move);
    this.game.sound(move === "S" ? "tick" : "card");
    this.afterMove();
  }

  key(e: KeyboardEvent): void {
    const t = this.t;
    const code = e.code;
    if (code === "Escape") {
      this.leave();
      return;
    }
    const confirm = code === "Enter" || code === "NumpadEnter" || code === "Space";
    if (t.phase === "bet") {
      const step = { ArrowLeft: -10, ArrowRight: 10, ArrowDown: -100, ArrowUp: 100 }[code];
      if (step) {
        this.bet = Math.max(t.opts.min, Math.min(t.maxBet(t.you), this.bet + step));
        this.game.sound("tick");
      } else if (code === "KeyM") this.bet = t.maxBet(t.you);
      else if (code === "KeyN") this.bet = t.opts.min;
      else if (confirm) this.placeBet();
      return;
    }
    if (t.phase === "done") {
      if (confirm) this.next();
      return;
    }
    const s = t.current();
    if (!s?.you) return;
    const moves: ("H" | "S" | "D")[] = ["H", "S", "D"];
    if (code === "KeyH") this.youAct("H");
    else if (code === "KeyS") this.youAct("S");
    else if (code === "KeyD") this.youAct("D");
    else if (code === "ArrowLeft") this.cursor = (this.cursor + 2) % 3;
    else if (code === "ArrowRight") this.cursor = (this.cursor + 1) % 3;
    else if (confirm) this.youAct(moves[this.cursor]);
  }

  animating(now: number): boolean {
    if (this.aiAt && now >= this.aiAt) {
      this.aiAt = 0;
      const t = this.t;
      const s = t.current();
      if (s && !s.you) {
        t.act(t.aiMove());
        this.game.sound("card");
      }
      this.afterMove();
    }
    return this.aiAt > 0;
  }

  draw(term: Term): void {
    const g = this.game;
    const t = this.t;
    const feltColor = C.feltDark;
    felt(term, 0, 0, COLS, ROWS, C.black);
    felt(term, 1, 2, COLS - 2, 29, feltColor);
    term.center(0, `BLACKJACK TOURNAMENT  ·  ${g.casino?.name ?? ""}`, C.gold);
    term.center(
      1,
      `Hand ${Math.max(1, t.phase === "bet" ? t.hand + 1 : t.hand)} of ${t.opts.hands}  ·  Bets ${t.opts.min}-${t.opts.max} chips  ·  Dealer stands on soft 17  ·  No splits  ·  Most chips wins`,
      C.gray,
    );

    // The dealer.
    const showDealer = t.phase !== "bet" && t.dealer.length > 0;
    term.text(48, 3, "Dealer", C.white, feltColor);
    if (showDealer) {
      const cards = t.dealer.map((c, i) => (i === 1 && t.holeHidden ? null : c));
      drawHand(term, 40, 5, cards, 30);
      if (!t.holeHidden) {
        const d = bjTotal(t.dealer).total;
        term.text(
          48,
          11,
          isBlackjack(t.dealer) ? "Blackjack" : d > 21 ? `Bust (${d})` : `${d}`,
          d > 21 ? C.lime : C.white,
          feltColor,
        );
      }
    }

    // The seats.
    const cur = t.current();
    const sw = 21;
    const x0 = Math.floor((COLS - sw * t.seats.length) / 2);
    t.seats.forEach((s, i) => {
      const x = x0 + i * sw;
      const turn = s === cur;
      const nameBg = turn ? C.darkGold : feltColor;
      term.text(
        x,
        13,
        ` ${s.you ? `${g.s.name} (you)` : s.e.short} `.slice(0, sw - 1),
        s.you ? C.yellow : s.e.color,
        nameBg,
      );
      if (s.out) {
        term.text(x, 14, "Out", C.gray, feltColor);
        return;
      }
      term.text(x + 1, 14, chips(t.stack(s)), C.white, feltColor);
      term.text(x + 1, 15, ordinal(t.place(s)), t.place(s) === 1 ? C.gold : C.gray, feltColor);
      if (s.cards.length) {
        drawHand(term, x + 1, 17, s.cards, sw - 2);
        const tot = bjTotal(s.cards);
        term.text(
          x + 1,
          23,
          isBlackjack(s.cards)
            ? "Blackjack"
            : `${tot.soft && tot.total <= 21 ? "soft " : ""}${tot.total}`,
          tot.total > 21 ? C.red : C.paper,
          feltColor,
        );
      }
      if (s.bet)
        term.text(x + 1, 24, `Bet ${s.bet}${s.doubled ? " (x2)" : ""}`, C.yellow, feltColor);
      if (s.result && t.phase === "done") {
        const [text, col] = OUTCOME_TEXT[s.result];
        term.text(x + 11, 23, text, col, feltColor);
      }
      const line = this.speech.get(s);
      if (line)
        wrapLines(`"${line}"`, sw - 2)
          .slice(0, 2)
          .forEach((l, k) => {
            term.text(x + 1, 25 + k, l, s.e.color, feltColor);
          });
    });

    // Controls.
    const by = 28;
    const you = t.you;
    if (t.phase === "bet") {
      const labels = [`Bet ${this.bet}`];
      buttons(term, 4, by, labels, 0);
      term.text(
        4 + buttonsWidth(labels) + 3,
        by,
        "←→ ±10  ↑↓ ±100  N min  M max  Enter bet  Esc leave",
        C.paper,
        feltColor,
      );
    } else if (cur?.you) {
      const labels = ["Hit", "Stand", "Double"];
      buttons(term, 4, by, labels, this.cursor, [true, true, t.canDouble(you)]);
      let hx = 4 + buttonsWidth(labels) + 3;
      hx = term.text(hx, by, "H hit  S stand  D double", C.paper, feltColor);
      const up = t.upCard;
      if (g.skill("cards") >= 1 && up) {
        const m = basicStrategy(you.cards, up, TOURNEY_RULES, t.canDouble(you), false);
        term.text(
          hx + 3,
          by,
          `The book says: ${MOVE_NAME[m === "P" ? "H" : m]}`,
          C.cyan,
          feltColor,
        );
      }
    } else if (cur) term.text(4, by, `${cur.e.short} is playing...`, C.gray, feltColor);
    if (this.message) term.text(4, by + 1, this.message, this.messageColor, feltColor, COLS - 2);

    // Who's leading.
    const lead = t.standings()[0];
    const left = t.phase === "bet" ? t.handsLeft : t.opts.hands - t.hand;
    term.text(
      4,
      3,
      `Leader: ${lead.you ? "you" : lead.e.short} with ${chips(t.stack(lead))}`,
      lead.you ? C.lime : C.paper,
      feltColor,
    );
    term.text(
      4,
      4,
      `${left} hand${left === 1 ? "" : "s"} to go${t.phase === "bet" ? "" : " after this"}`,
      left <= 2 ? C.yellow : C.gray,
      feltColor,
    );
  }
}
