import { rulesText } from "../../../game/blackjack";
import { type Card, cardName } from "../../../game/cards";
import { C } from "../../../game/colors";
import type { RollerDef } from "../../../game/data/casinos";
import { DRINK_ORDER, DRINKS } from "../../../game/data/items";
import { type Game, money } from "../../../game/game";
import { limitsFor } from "../../../game/poker";
import type { Npc } from "../../../game/world";
import type { App, Screen } from "../app";
import { isBack, isConfirm } from "../input";
import { COLS, type Term } from "../term";
import { BlackjackScreen } from "./blackjack";
import { drawCard, drawPortrait, wrapLines } from "./draw";
import type { PlayScreen } from "./play";
import { PokerScreen } from "./poker";

const up = (e: KeyboardEvent) => e.code === "ArrowUp" || e.code === "Numpad8";
const down = (e: KeyboardEvent) => e.code === "ArrowDown" || e.code === "Numpad2";

/** A list of choices in a box. */
function drawChoices(
  t: Term,
  x: number,
  y: number,
  options: string[],
  cursor: number,
  enabled?: boolean[],
): void {
  options.forEach((o, i) => {
    const on = enabled?.[i] ?? true;
    const sel = i === cursor;
    t.text(
      x,
      y + i,
      `${sel ? "►" : " "} ${o}`,
      sel ? (on ? C.yellow : C.gray) : on ? C.light : C.dim,
    );
  });
}

/** Talking to a high roller. */
export class RollerScreen implements Screen {
  private cursor = 0;
  private line: string;
  private lineColor: string = C.white;
  private chatIndex = 0;

  constructor(
    private app: App,
    private play: PlayScreen,
    private r: RollerDef,
  ) {
    const g = this.game;
    this.line = g.beaten(r.id) ? r.after : r.greet;
  }

  get game(): Game {
    return this.app.game as Game;
  }

  private options(): { label: string; on: boolean; act: () => void }[] {
    const g = this.game;
    const r = this.r;
    if (g.beaten(r.id))
      return [
        { label: "Chat", on: true, act: () => this.chat() },
        { label: "Leave", on: true, act: () => this.app.pop() },
      ];
    return [
      {
        label: `Play ${r.game === "poker" ? "five-card draw" : "blackjack"} for ${money(r.stake)}`,
        on: g.s.cash >= r.stake,
        act: () => this.sit(),
      },
      { label: "Chat", on: true, act: () => this.chat() },
      { label: "House rules", on: true, act: () => this.rules() },
      { label: "Leave", on: true, act: () => this.app.pop() },
    ];
  }

  private chat(): void {
    this.line = this.r.chat[this.chatIndex++ % this.r.chat.length];
    this.lineColor = C.white;
  }

  private rules(): void {
    const r = this.r;
    if (r.game === "blackjack" && r.rules) {
      const min = Math.max(1, Math.round(r.stake / 20));
      this.line = `Blackjack, ${r.short} deals. ${rulesText(r.rules)}. Bets ${money(min)} to ${money(Math.round(r.stake / 4))}. Take all ${money(r.stake)} of their stack to win.`;
    } else {
      const l = limitsFor(r.stake);
      this.line = `Five-card draw, heads up. Ante ${money(l.ante)}. Bets are ${money(l.small)} before the draw and ${money(l.big)} after. Draw up to three cards (four if you keep an ace). Take their whole stack to win.`;
    }
    this.lineColor = C.cyan;
  }

  private sit(): void {
    const g = this.game;
    const err = g.startDuel(this.r);
    if (err) {
      this.line = err;
      this.lineColor = C.orange;
      this.app.sound("deny");
      return;
    }
    this.app.pop();
    if (this.r.game === "poker") this.app.push(new PokerScreen(this.app, this.play, this.r));
    else this.app.push(new BlackjackScreen(this.app, this.play, null, this.r));
  }

  key(e: KeyboardEvent): void {
    const opts = this.options();
    if (up(e)) this.cursor = (this.cursor + opts.length - 1) % opts.length;
    else if (down(e)) this.cursor = (this.cursor + 1) % opts.length;
    else if (isBack(e)) this.app.pop();
    else if (isConfirm(e)) {
      const o = opts[Math.min(this.cursor, opts.length - 1)];
      if (o.on) o.act();
      else {
        this.line = `"Come back when you've got ${money(this.r.stake)}, kid."`;
        this.lineColor = C.orange;
        this.app.sound("deny");
      }
    }
  }

  draw(t: Term): void {
    const g = this.game;
    const r = this.r;
    const w = 76;
    const x = Math.floor((COLS - w) / 2);
    const y = 7;
    const h = 18;
    t.box(
      x,
      y,
      w,
      h,
      r.color,
      r.id === "dutch" ? "YOUR RIVAL" : r.boss ? "HIGH ROLLER - BOSS" : "HIGH ROLLER",
      r.color,
    );
    drawPortrait(t, x + 3, y + 2, r.look);
    const tx = x + 17;
    t.text(tx, y + 2, r.name, r.color);
    t.text(tx, y + 3, r.title, C.gray);
    t.text(
      tx,
      y + 4,
      g.beaten(r.id)
        ? "Cleaned out."
        : `Plays ${r.game === "poker" ? "five-card draw" : "blackjack"} - stake ${money(r.stake)}`,
      g.beaten(r.id) ? C.green : C.light,
    );
    if (r.tells && g.knowsTell(r.id)) t.text(tx, y + 5, "You've heard about their tell.", C.cyan);
    else if (r.id === "dutch")
      t.text(
        tx,
        y + 5,
        `Your record against him: ${g.s.rival.wins} won, ${g.s.rival.losses} lost.`,
        C.gray,
        undefined,
        x + w - 2,
      );
    wrapLines(`"${this.line.replace(/^"|"$/g, "")}"`, w - 20)
      .slice(0, 5)
      .forEach((l, i) => {
        t.text(tx, y + 7 + i, l, this.lineColor);
      });
    const opts = this.options();
    drawChoices(
      t,
      x + 3,
      y + 12,
      opts.map((o) => o.label),
      Math.min(this.cursor, opts.length - 1),
      opts.map((o) => o.on),
    );
    t.text(x + 3, y + h - 2, `You have ${money(g.s.cash)}.`, C.gray);
    t.text(x + w - 26, y + h - 2, "↑↓ choose  Enter  Esc", C.dim);
  }
}

/** Talking to anyone else: gamblers, staff, people on the street. */
export class TalkScreen implements Screen {
  private cursor = 0;
  private said: string;
  private color: string = C.white;
  private cut: { yours: Card; theirs: Card } | null = null;

  constructor(
    private app: App,
    private npc: Npc,
  ) {
    const g = app.game as Game;
    if (npc.kind === "pickpocket") {
      this.said = g.catchPickpocket(npc);
      this.color = C.lime;
    } else
      this.said = npc.tip
        ? `Say, friend... I know a thing or two. Spot me ${money(npc.tip.price)} and I'll tell you.`
        : g.lineFor(npc);
  }

  private get game(): Game {
    return this.app.game as Game;
  }

  /** What they're offering, if anything: a paid tip or a cut of the deck. */
  private offer(): { label: string; on: boolean; act: () => void } | null {
    const g = this.game;
    const tip = this.npc.tip;
    if (tip)
      return {
        label: `Pay ${money(tip.price)}`,
        on: g.s.cash >= tip.price,
        act: () => {
          const text = tip.text;
          const err = g.buyTip(this.npc);
          this.said = err ?? text;
          this.color = err ? C.orange : C.cyan;
          if (err) this.app.sound("deny");
        },
      };
    if (this.npc.kind === "millionaire") {
      const bet = g.millionaireBet();
      return {
        label: `Cut the deck for ${money(bet)}`,
        on: bet >= 1,
        act: () => {
          const r = g.cutDeck(this.npc);
          if (typeof r === "string") {
            this.said = r;
            return;
          }
          this.cut = r;
          this.said = r.won
            ? `Aw, nuts! Your ${cardName(r.yours)} beats my ${cardName(r.theirs)}. That's ${money(r.bet)} to you, kid!`
            : `Ha HA! My ${cardName(r.theirs)} beats your ${cardName(r.yours)}! Better luck next time, kid!`;
          this.color = r.won ? C.lime : C.red;
        },
      };
    }
    return null;
  }

  key(e: KeyboardEvent): void {
    const offer = this.offer();
    if (offer) {
      if (up(e) || down(e)) this.cursor = 1 - this.cursor;
      else if (isBack(e)) this.app.pop();
      else if (isConfirm(e)) {
        if (this.cursor === 1) this.app.pop();
        else if (offer.on) offer.act();
        else this.app.sound("deny");
      }
      return;
    }
    if (isBack(e) || isConfirm(e)) this.app.pop();
  }

  draw(t: Term): void {
    const w = 70;
    const x = Math.floor((COLS - w) / 2);
    const y = 9;
    const lines = wrapLines(`"${this.said}"`, w - 6);
    const offer = this.offer();
    const h = 9 + lines.length + (this.cut ? 6 : 0);
    t.box(x, y, w, h, this.npc.color, this.npc.name.replace(/^a /, "").toUpperCase());
    t.put(x + 3, y + 2, this.npc.glyph, this.npc.color);
    t.text(x + 5, y + 2, this.npc.name[0].toUpperCase() + this.npc.name.slice(1), this.npc.color);
    lines.forEach((l, i) => t.text(x + 3, y + 4 + i, l, this.color));
    let yy = y + 5 + lines.length;
    if (this.cut) {
      t.text(x + 3, yy + 2, "You", C.yellow);
      drawCard(t, x + 8, yy, this.cut.yours);
      t.text(x + 20, yy + 2, "Him", C.gold);
      drawCard(t, x + 25, yy, this.cut.theirs);
      yy += 6;
    }
    if (offer) drawChoices(t, x + 3, yy, [offer.label, "No thanks"], this.cursor, [offer.on, true]);
    else t.text(x + 3, y + h - 2, "Enter / Esc", C.dim);
  }
}

/** The bar (or a waitress): drinks that help for a while. */
export class BarScreen implements Screen {
  private cursor = 0;
  private message = "";

  constructor(private app: App) {}

  key(e: KeyboardEvent): void {
    const g = this.app.game as Game;
    if (up(e)) this.cursor = (this.cursor + DRINK_ORDER.length) % (DRINK_ORDER.length + 1);
    if (down(e)) this.cursor = (this.cursor + 1) % (DRINK_ORDER.length + 1);
    if (isBack(e)) this.app.pop();
    else if (isConfirm(e)) {
      if (this.cursor === DRINK_ORDER.length) {
        this.app.pop();
        return;
      }
      const id = DRINK_ORDER[this.cursor];
      const err = g.buyDrink(id);
      this.message = err ?? `Cheers! ${DRINKS[id].text}`;
      if (err) this.app.sound("deny");
    }
  }

  draw(t: Term): void {
    const g = this.app.game as Game;
    const w = 66;
    const x = Math.floor((COLS - w) / 2);
    const y = 9;
    t.box(x, y, w, 17, C.amber, "THE BAR");
    t.text(x + 3, y + 2, '"What\'ll it be?"', C.white);
    DRINK_ORDER.forEach((id, i) => {
      const d = DRINKS[id];
      const sel = i === this.cursor;
      const price = g.drinkPrice(id);
      t.text(x + 3, y + 4 + i * 2, `${sel ? "►" : " "} ${d.name}`, sel ? C.yellow : C.light);
      t.text(
        x + 24,
        y + 4 + i * 2,
        price ? money(price) : "free",
        price > g.s.cash ? C.red : C.lime,
      );
      t.text(x + 32, y + 4 + i * 2, d.text, C.gray, undefined, x + w - 2);
    });
    const leave = this.cursor === DRINK_ORDER.length;
    t.text(
      x + 3,
      y + 4 + DRINK_ORDER.length * 2,
      `${leave ? "►" : " "} Leave`,
      leave ? C.yellow : C.light,
    );
    if (this.message) t.text(x + 3, y + 15, this.message, C.cyan, undefined, x + w - 2);
    t.text(x + w - 30, y + 2, `Heat here: ${g.heatHere()}  ${money(g.s.cash)}`, C.gray);
  }
}
