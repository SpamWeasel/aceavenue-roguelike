import { C } from "../../../game/colors";
import { type Game, money } from "../../../game/game";
import {
  VideoPokerHand,
  VP_HANDS,
  VP_MAX_COINS,
  VP_ROYAL_MAX,
  VP_TABLES,
  vpHint,
  vpPays,
  vpRank,
} from "../../../game/videopoker";
import type { VideoSpot } from "../../../game/world";
import type { App, Screen } from "../app";
import { animMs } from "../settings";
import { COLS, ROWS, type Term } from "../term";
import { CARD_W, drawCard, felt } from "./draw";
import { NoticeScreen } from "./menus";
import type { PlayScreen } from "./play";

type Phase = "bet" | "hold" | "done";

const BG = "#0c1a3a";
const CX = 30;
const CY = 17;

/** A Jacks or Better video poker machine. */
export class VideoPokerScreen implements Screen {
  readonly opaque = true;
  private coins = VP_MAX_COINS;
  private phase: Phase = "bet";
  private hand: VideoPokerHand | null = null;
  private cursor = 0;
  private message = "";
  private messageColor: string = C.white;
  private dealtAt = 0;

  constructor(
    private app: App,
    private play: PlayScreen,
    private spot: VideoSpot,
  ) {
    this.message = `${money(spot.coin)} a coin. Five coins for the big royal flush payout.`;
  }

  get game(): Game {
    return this.app.game as Game;
  }

  private get table() {
    return VP_TABLES[this.spot.table];
  }

  private deal(): void {
    const g = this.game;
    const cost = this.coins * this.spot.coin;
    if (!g.pay(cost)) {
      this.say("You don't have enough cash for that bet.", C.orange);
      g.sound("deny");
      return;
    }
    this.hand = new VideoPokerHand(g.rng);
    this.phase = "hold";
    this.cursor = 0;
    this.dealtAt = performance.now();
    this.say("Hold the cards you want to keep, then draw.", C.white);
    g.sound("card");
  }

  private drawCards(): void {
    const g = this.game;
    const h = this.hand;
    if (!h) return;
    h.draw();
    this.phase = "done";
    this.dealtAt = performance.now();
    const cost = this.coins * this.spot.coin;
    const pays = vpPays(this.table, h.cards, this.coins) * this.spot.coin;
    g.receive(pays);
    const rank = vpRank(h.cards);
    if (pays > 0) {
      this.say(`${VP_HANDS[rank]}! You win ${money(pays)}.`, rank === 0 ? C.gold : C.lime);
      g.sound(rank === 0 ? "jackpot" : rank <= 3 ? "bigwin" : "coin");
    } else {
      this.say("No win. Deal again?", C.gray);
    }
    const out = g.houseResult({
      table: this.spot,
      bet: cost,
      net: pays - cost,
      min: this.spot.coin,
      jackpot: rank === 0,
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

  private say(text: string, color: string): void {
    this.message = text;
    this.messageColor = color;
  }

  private leave(): void {
    if (this.phase === "hold") return;
    this.app.pop();
    this.play.after();
  }

  key(e: KeyboardEvent): void {
    const code = e.code;
    const confirm = code === "Enter" || code === "NumpadEnter" || code === "KeyR";
    if (this.phase === "hold") {
      const h = this.hand as VideoPokerHand;
      const digit = /^(Digit|Numpad)([1-5])$/.exec(code);
      if (digit) h.toggle(Number(digit[2]) - 1);
      else if (code === "ArrowLeft") this.cursor = (this.cursor + 4) % 5;
      else if (code === "ArrowRight") this.cursor = (this.cursor + 1) % 5;
      else if (code === "Space" || code === "ArrowUp" || code === "ArrowDown")
        h.toggle(this.cursor);
      else if (code === "KeyB" && this.game.skill("cards") >= 1) {
        const keep = vpHint(h.cards);
        h.held = [0, 1, 2, 3, 4].map((i) => keep.includes(i));
      } else if (confirm || code === "KeyD") this.drawCards();
      else return;
      this.game.sound("tick");
      return;
    }
    if (code === "Escape" || code === "Backspace") {
      this.leave();
      return;
    }
    if (code === "ArrowUp" || code === "ArrowRight")
      this.coins = Math.min(VP_MAX_COINS, this.coins + 1);
    else if (code === "ArrowDown" || code === "ArrowLeft") this.coins = Math.max(1, this.coins - 1);
    else if (/^Digit[1-5]$/.test(code)) this.coins = Number(code.slice(5));
    else if (confirm || code === "Space") this.deal();
  }

  animating(now: number): boolean {
    return now - this.dealtAt < animMs(400);
  }

  draw(t: Term, now: number): void {
    const g = this.game;
    const tb = this.table;
    felt(t, 0, 0, COLS, ROWS, C.black);
    felt(t, 1, 2, COLS - 2, 29, BG);
    t.center(
      0,
      `VIDEO POKER  ·  Jacks or Better  ·  ${this.spot.region}, machine ${this.spot.n}`,
      C.cyan,
    );
    t.center(
      1,
      `Pay table ${tb.id} (Full House / Flush)  ·  ${money(this.spot.coin)} a coin  ·  1-${VP_MAX_COINS} coins`,
      C.gray,
    );

    // Pay table, one column per coin count.
    const px = 14;
    const py = 3;
    const rank = this.phase === "done" && this.hand ? vpRank(this.hand.cards) : -1;
    VP_HANDS.forEach((name, i) => {
      const hit = i === rank;
      t.text(px, py + i, name.toUpperCase(), hit ? C.yellow : C.paper, hit ? C.navy : BG);
      for (let c = 1; c <= VP_MAX_COINS; c++) {
        const pay = i === 0 && c === VP_MAX_COINS ? VP_ROYAL_MAX * c : tb.pays[i] * c;
        const col = c === this.coins;
        t.text(
          px + 20 + (c - 1) * 9,
          py + i,
          String(pay).padStart(6),
          hit && col ? C.black : col ? C.yellow : C.gray,
          hit && col ? C.yellow : col ? C.navy : BG,
        );
      }
    });

    // The cards.
    const h = this.hand;
    const flip = now - this.dealtAt < animMs(400);
    const sense = g.skill("cards");
    const book = h && this.phase === "hold" && sense >= 1 && !flip ? vpHint(h.cards) : [];
    for (let i = 0; i < 5; i++) {
      const x = CX + i * (CARD_W + 3);
      const card = h ? h.cards[i] : null;
      const showBack = !h || (flip && !(this.phase === "done" && h.held[i]));
      drawCard(t, x, CY, showBack ? null : card, {
        lift: this.phase === "hold" && i === this.cursor,
      });
      if (h?.held[i] && this.phase !== "bet") t.text(x + 1, CY + 6, "HELD", C.yellow, BG);
      if (this.phase === "hold")
        t.text(x + 3, CY + 7, String(i + 1), i === this.cursor ? C.yellow : C.gray, BG);
      if (book.includes(i)) t.text(x + 1, CY - 2, "book", C.cyan, BG);
    }

    // Controls.
    const by = 27;
    if (this.phase === "hold") {
      t.text(14, by, "1-5 or Space: hold   ←→ move   Enter: draw", C.paper, BG);
      if (sense >= 1) t.text(14, by + 1, "B: hold what the book says (Card Sense)", C.cyan, BG);
    } else {
      t.text(
        14,
        by,
        `Bet ${this.coins} coin${this.coins === 1 ? "" : "s"} (${money(this.coins * this.spot.coin)})`,
        C.yellow,
        BG,
      );
      t.text(44, by, "↑↓ or 1-5 coins   Enter deal   Esc leave", C.paper, BG);
    }
    t.text(14, by + 2, this.message, this.messageColor, BG, COLS - 2);

    const sx = 80;
    t.text(sx, 14, `Cash ${money(g.s.cash)}`, C.lime, BG);
    t.text(sx, 15, `Heat ${g.heatHere()}`, g.heatHere() >= 70 ? C.red : C.paper, BG);
    t.text(sx, 16, `Club pts ${Math.floor(g.s.comps)}`, C.gold, BG);
    t.text(sx, 18, "Read the glass: a 9/6", C.gray, BG);
    t.text(sx, 19, "machine pays back far", C.gray, BG);
    t.text(sx, 20, "more than a 6/5 one.", C.gray, BG);
    if (g.skill("slots") >= 1)
      t.text(sx, 22, `Pays back ${(tb.rtp * 100).toFixed(1)}% at best`, C.cyan, BG, COLS - 2);
  }
}
