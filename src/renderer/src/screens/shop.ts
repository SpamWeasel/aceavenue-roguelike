import { C } from "../../../game/colors";
import { ITEMS, SKILL_ORDER, SKILLS } from "../../../game/data/items";
import { LOAN_INTEREST, LOAN_TERM, SHOPS, type ShopId } from "../../../game/data/shops";
import { type Game, money, POCKET_SIZE } from "../../../game/game";
import type { App, Screen } from "../app";
import { isBack, isConfirm } from "../input";
import { COLS, type Term } from "../term";
import { wrapLines } from "./draw";

interface Entry {
  label: string;
  price: number | null;
  desc: string;
  on: boolean;
  act: () => string | null;
  color?: string;
}

/** The shops along Ace Avenue. */
export class ShopScreen implements Screen {
  private cursor = 0;
  private tab = 0;
  private message = "";
  private messageColor: string = C.white;

  constructor(
    private app: App,
    private id: ShopId,
  ) {
    this.message = SHOPS[id].greet;
  }

  get game(): Game {
    return this.app.game as Game;
  }

  private tabs(): string[] {
    return this.id === "pawn" ? ["Buy", "Sell"] : [];
  }

  private entries(): Entry[] {
    const g = this.game;
    const s = g.s;
    switch (this.id) {
      case "academy":
        return SKILL_ORDER.map((id) => {
          const def = SKILLS[id];
          const level = s.skills[id];
          const price = g.lessonPrice(id);
          return {
            label: `${def.name} ${level}${price === null ? " (mastered)" : ` → ${level + 1}`}`,
            price,
            desc: price === null ? def.blurb : `${def.blurb} Next: ${def.levels[level]}`,
            on: price !== null && s.cash >= price,
            act: () => g.buyLesson(id),
          };
        });
      case "charms":
        return g.charmStock().map((id) => {
          const it = ITEMS[id];
          const owned = !it.consumable && g.has(id);
          return {
            label: `${it.glyph} ${it.name}${owned ? " (have)" : ""}`,
            price: it.price,
            desc: it.text,
            on: !owned && s.cash >= it.price && s.pockets.length < POCKET_SIZE,
            act: () => g.buyItem(id, it.price),
            color: it.color,
          };
        });
      case "pawn":
        if (this.tab === 0)
          return g.pawnStock().map(({ id, price }) => {
            const it = ITEMS[id];
            const owned = !it.consumable && g.has(id);
            return {
              label: `${it.glyph} ${it.name}${owned ? " (have)" : ""}`,
              price,
              desc: `${it.text}${it.kind === "cheat" ? " (Under the counter. Don't tell anyone where you got it.)" : ""}`,
              on: !owned && s.cash >= price && s.pockets.length < POCKET_SIZE,
              act: () => g.buyItem(id, price),
              color: it.color,
            };
          });
        return s.pockets.map((id, i) => ({
          label: `${ITEMS[id].glyph} ${ITEMS[id].name}`,
          price: g.sellPrice(id),
          desc: `Abe pays half price. ${ITEMS[id].text}`,
          on: true,
          act: () => g.sellItem(i),
          color: ITEMS[id].color,
        }));
      case "motel":
        return [
          {
            label: "Rent a room for the night",
            price: g.motelPrice,
            desc: "Sleep until noon. Every casino forgets your face: all heat and bans are cleared. Drinks wear off.",
            on: s.cash >= g.motelPrice,
            act: () => g.sleep(),
          },
        ];
      case "loans": {
        const owe = s.debt > 0;
        return [
          {
            label: `Borrow ${money(g.loanSize)}`,
            price: null,
            desc: `Pay back ${money(Math.round(g.loanSize * (1 + LOAN_INTEREST)))} within ${LOAN_TERM} turns. Late? Vinnie's collector takes it off you on the street.`,
            on: !owe,
            act: () => g.borrow(),
          },
          {
            label: owe ? `Repay (you owe ${money(s.debt)})` : "Repay",
            price: null,
            desc: owe
              ? `Pays as much as you can, up to ${money(s.debt)}.`
              : "You don't owe Vinnie anything.",
            on: owe && s.cash > 0,
            act: () => g.repay(),
          },
        ];
      }
    }
  }

  key(e: KeyboardEvent): void {
    const list = this.entries();
    const n = list.length + 1;
    if (e.code === "ArrowUp") this.cursor = (this.cursor + n - 1) % n;
    else if (e.code === "ArrowDown") this.cursor = (this.cursor + 1) % n;
    else if (e.code === "Tab" && this.tabs().length) {
      this.tab = (this.tab + 1) % this.tabs().length;
      this.cursor = 0;
    } else if ((e.code === "ArrowLeft" || e.code === "ArrowRight") && this.tabs().length) {
      this.tab = (this.tab + 1) % this.tabs().length;
      this.cursor = 0;
    } else if (isBack(e)) this.app.pop();
    else if (isConfirm(e)) {
      if (this.cursor >= list.length) {
        this.app.pop();
        return;
      }
      const it = list[this.cursor];
      if (!it.on) {
        this.message = "You can't do that right now.";
        this.messageColor = C.orange;
        this.app.sound("deny");
        return;
      }
      const err = it.act();
      if (err) {
        this.message = err;
        this.messageColor = C.orange;
        this.app.sound("deny");
      } else {
        this.message = "Pleasure doing business.";
        this.messageColor = C.green;
        void this.app.save();
      }
      this.cursor = Math.min(this.cursor, this.entries().length);
    }
  }

  draw(t: Term): void {
    const g = this.game;
    const shop = SHOPS[this.id];
    const w = 84;
    const x = Math.floor((COLS - w) / 2);
    const y = 4;
    const h = 28;
    t.box(x, y, w, h, shop.color, shop.name.toUpperCase(), shop.color);
    wrapLines(`${shop.owner[0].toUpperCase()}${shop.owner.slice(1)}: "${shop.greet}"`, w - 6)
      .slice(0, 2)
      .forEach((l, i) => t.text(x + 3, y + 2 + i, l, C.white));
    let ly = y + 5;
    const tabs = this.tabs();
    if (tabs.length) {
      let tx = x + 3;
      tabs.forEach((label, i) => {
        const sel = i === this.tab;
        t.text(tx, ly, ` ${label} `, sel ? C.black : C.light, sel ? shop.color : C.dark);
        tx += label.length + 3;
      });
      t.text(tx + 1, ly, "Tab / ←→ switch", C.dim);
      ly += 2;
    }
    const list = this.entries();
    if (!list.length)
      t.text(
        x + 3,
        ly,
        this.id === "pawn" && this.tab === 1 ? "Your pockets are empty." : "Nothing here.",
        C.gray,
      );
    list.forEach((it, i) => {
      const sel = i === this.cursor;
      t.text(
        x + 3,
        ly + i,
        `${sel ? "►" : " "} ${it.label}`,
        sel ? C.yellow : it.on ? (it.color ?? C.light) : C.gray,
        undefined,
        x + 52,
      );
      if (it.price !== null) t.text(x + 55, ly + i, money(it.price), it.on ? C.lime : C.dim);
    });
    const leave = this.cursor >= list.length;
    t.text(
      x + 3,
      ly + Math.max(1, list.length) + 1,
      `${leave ? "►" : " "} Leave`,
      leave ? C.yellow : C.light,
    );
    const sel = list[this.cursor];
    if (sel)
      wrapLines(sel.desc, w - 6)
        .slice(0, 3)
        .forEach((l, i) => t.text(x + 3, y + h - 8 + i, l, C.cyan));
    t.text(x + 3, y + h - 4, this.message, this.messageColor, undefined, x + w - 2);
    t.text(
      x + 3,
      y + h - 2,
      `Cash ${money(g.s.cash)}   Pockets ${g.s.pockets.length}/${POCKET_SIZE}`,
      C.gray,
    );
    t.text(x + w - 24, y + h - 2, "↑↓  Enter  Esc", C.dim);
  }
}
