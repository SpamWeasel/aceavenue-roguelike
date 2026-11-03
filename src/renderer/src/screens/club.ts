import { C } from "../../../game/colors";
import { CLUB_REWARDS } from "../../../game/data/shops";
import { type Game, money, POCKET_SIZE } from "../../../game/game";
import type { App, Screen } from "../app";
import { isBack, isConfirm } from "../input";
import { COLS, type Term } from "../term";

/** The cashier cage's Players' Club desk: comp points for perks. */
export class ClubScreen implements Screen {
  private cursor = 0;
  private message =
    "Every bet at the tables and machines earns points, honored at every casino on the Avenue.";
  private messageColor: string = C.gray;

  constructor(private app: App) {}

  get game(): Game {
    return this.app.game as Game;
  }

  key(e: KeyboardEvent): void {
    const n = CLUB_REWARDS.length + 1;
    if (e.code === "ArrowUp") this.cursor = (this.cursor + n - 1) % n;
    else if (e.code === "ArrowDown") this.cursor = (this.cursor + 1) % n;
    else if (isBack(e)) this.app.pop();
    else if (isConfirm(e)) {
      if (this.cursor === CLUB_REWARDS.length) {
        this.app.pop();
        return;
      }
      const err = this.game.redeem(CLUB_REWARDS[this.cursor].id);
      this.message = err ?? `Enjoy! ${CLUB_REWARDS[this.cursor].text}`;
      this.messageColor = err ? C.orange : C.green;
      if (err) this.app.sound("deny");
      else void this.app.save();
    }
  }

  draw(t: Term): void {
    const g = this.game;
    const w = 76;
    const x = Math.floor((COLS - w) / 2);
    const y = 7;
    const h = 22;
    const pts = Math.floor(g.s.comps);
    t.box(x, y, w, h, C.gold, "THE PLAYERS' CLUB", C.gold);
    t.text(x + 3, y + 2, '"Welcome back! Let\'s see what your card is worth tonight."', C.white);
    t.text(x + 3, y + 4, `Your points: ${pts}`, C.gold);
    t.text(x + 26, y + 4, `(one point per ${money(g.compUnit)} you bet here)`, C.gray);
    CLUB_REWARDS.forEach((r, i) => {
      const sel = i === this.cursor;
      const ok = pts >= r.points && !(r.item && g.s.pockets.length >= POCKET_SIZE);
      const label = r.id === "cash" ? `${r.label} (${money(g.compUnit * 3)})` : r.label;
      t.text(
        x + 3,
        y + 6 + i,
        `${sel ? "►" : " "} ${label}`,
        sel ? C.yellow : ok ? C.light : C.gray,
      );
      t.text(x + 40, y + 6 + i, `${r.points} pts`, ok ? C.gold : C.dim);
    });
    const leave = this.cursor === CLUB_REWARDS.length;
    t.text(
      x + 3,
      y + 7 + CLUB_REWARDS.length,
      `${leave ? "►" : " "} Leave`,
      leave ? C.yellow : C.light,
    );
    const sel = CLUB_REWARDS[this.cursor];
    if (sel) t.text(x + 3, y + h - 6, sel.text, C.cyan, undefined, x + w - 2);
    t.text(x + 3, y + h - 4, this.message, this.messageColor, undefined, x + w - 2);
    t.text(x + 3, y + h - 2, `Cash ${money(g.s.cash)}   Heat here ${g.heatHere()}`, C.gray);
    t.text(x + w - 18, y + h - 2, "↑↓  Enter  Esc", C.dim);
  }
}
