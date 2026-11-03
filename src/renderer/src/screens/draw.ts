import { type Card, isRed, rankName, SUIT_CHAR } from "../../../game/cards";
import { C } from "../../../game/colors";
import type { Look } from "../../../game/data/casinos";
import type { Term } from "../term";

export const CARD_W = 7;
export const CARD_H = 5;

/** A playing card, 7x5. Pass null for a face-down card. */
export function drawCard(
  t: Term,
  x: number,
  y: number,
  card: Card | null,
  opts: { lift?: boolean; dim?: boolean; mark?: string } = {},
): void {
  const yy = y - (opts.lift ? 1 : 0);
  if (!card) {
    for (let r = 0; r < CARD_H; r++)
      for (let c = 0; c < CARD_W; c++) {
        const edge = r === 0 || r === CARD_H - 1 || c === 0 || c === CARD_W - 1;
        t.put(
          x + c,
          yy + r,
          edge ? " " : (r + c) % 2 ? "▒" : "░",
          C.blue,
          edge ? C.paper : C.cardBack,
        );
      }
    return;
  }
  const bg = opts.dim ? C.gray : C.paper;
  const fg = isRed(card) ? C.red : C.black;
  t.fill(x, yy, CARD_W, CARD_H, " ", fg, bg);
  const r = rankName(card.rank);
  const s = SUIT_CHAR[card.suit];
  t.text(x + 1, yy + 1, r, fg, bg);
  t.put(x + 1 + r.length, yy + 1, s, fg, bg);
  t.put(x + 3, yy + 2, s, fg, bg);
  t.text(x + CARD_W - 1 - r.length - 1, yy + 3, s + r, fg, bg);
  if (opts.mark)
    t.text(x + Math.floor((CARD_W - opts.mark.length) / 2), yy + CARD_H, opts.mark, C.yellow);
}

/** A row of cards, spaced out (overlapping when there are many). */
export function drawHand(
  t: Term,
  x: number,
  y: number,
  cards: readonly (Card | null)[],
  maxW = 60,
  opts: (i: number) => { lift?: boolean; dim?: boolean; mark?: string } = () => ({}),
): number {
  const step =
    cards.length > 1 ? Math.min(CARD_W + 1, Math.floor((maxW - CARD_W) / (cards.length - 1))) : 0;
  cards.forEach((c, i) => drawCard(t, x + i * step, y, c, opts(i)));
  return cards.length ? (cards.length - 1) * step + CARD_W : 0;
}

/** Short card text like "K♥". */
export function cardText(t: Term, x: number, y: number, card: Card): number {
  const s = rankName(card.rank) + SUIT_CHAR[card.suit];
  return t.text(x, y, s, isRed(card) ? C.red : C.white);
}

/** A felt table area. */
export function felt(t: Term, x: number, y: number, w: number, h: number, color: string): void {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) t.put(xx, yy, " ", C.light, color);
}

/**
 * A row of buttons; the selected one is highlighted. Disabled buttons are grayed out.
 * Returns each button's x so callers can hit-test if they need to.
 */
export function buttons(
  t: Term,
  x: number,
  y: number,
  labels: string[],
  cursor: number,
  enabled: boolean[] = labels.map(() => true),
): number[] {
  const xs: number[] = [];
  let cx = x;
  labels.forEach((label, i) => {
    xs.push(cx);
    const sel = i === cursor;
    const on = enabled[i];
    const text = ` ${label} `;
    t.text(
      cx,
      y,
      text,
      sel ? C.black : on ? C.white : C.dim,
      sel ? (on ? C.yellow : C.gray) : on ? C.dim : C.dark,
    );
    cx += text.length + 1;
  });
  return xs;
}

export const buttonsWidth = (labels: string[]) => labels.reduce((w, l) => w + l.length + 3, -1);

/** A character portrait, 11 wide and 7 tall. */
export function drawPortrait(t: Term, x: number, y: number, look: Look, bg: string = C.ink): void {
  t.fill(x, y, 11, 7, " ", C.light, bg);
  const hats: Record<Look["hat"], [string, string]> = {
    cowboy: ["   ▄▄▄▄▄   ", "▀▀███████▀▀"],
    tophat: ["   █████   ", " ▄▄█████▄▄ "],
    captain: ["   ▄▄▄▄▄   ", "  ███████▄▄"],
    fedora: ["   ▄▄█▄▄   ", " ▄▄█████▄▄ "],
    beret: ["   ▄▄▄▄▄▄  ", "  ███████▀ "],
    hair: ["           ", "   ▄▄▄▄▄   "],
    longhair: ["   ▄▄▄▄▄   ", "  ███████  "],
    bun: ["    ▄█▄    ", "   ▄███▄   "],
    bald: ["           ", "    ▄▄▄    "],
    helmet: ["   ▄▄▄▄▄   ", "  █▀▀▀▀▀█  "],
    crown: ["  ▲ ▲ ▲ ▲  ", "  ███████  "],
    feather: ["      ,/   ", "   ▄▄██▄   "],
    pompadour: ["   ▄▄▄▄▄▄▄ ", "  ███████▀ "],
  };
  const [h1, h2] = hats[look.hat];
  const hatFg = look.hat === "bald" ? look.skin : look.hatColor;
  for (let i = 0; i < 11; i++) {
    if (h1[i] !== " ") t.put(x + i, y, h1[i], h1[i] === "▲" ? C.gold : hatFg, bg);
    if (h2[i] !== " ") t.put(x + i, y + 1, h2[i], hatFg, bg);
  }
  const skin = look.skin;
  // Face.
  for (let r = 0; r < 2; r++) {
    t.put(x + 2, y + 2 + r, "(", skin, bg);
    t.put(x + 8, y + 2 + r, ")", skin, bg);
    t.fill(x + 3, y + 2 + r, 5, 1, " ", skin, bg);
  }
  t.text(x + 4, y + 2, look.eyes.slice(0, 3), C.white, bg);
  if (look.chin === "stache") {
    t.put(x + 4, y + 3, "▀", look.hat === "bald" ? C.steel : look.hatColor, bg);
    t.put(x + 6, y + 3, "▀", look.hat === "bald" ? C.steel : look.hatColor, bg);
  }
  t.put(x + 5, y + 3, look.mouth, C.pink, bg);
  if (look.chin === "beard") t.text(x + 3, y + 4, "\\▓▓▓/", C.steel, bg);
  else t.text(x + 3, y + 4, "\\___/", skin, bg);
  if (look.hat === "longhair")
    for (let r = 2; r < 5; r++) {
      t.put(x + 1, y + r, "█", look.hatColor, bg);
      t.put(x + 9, y + r, "█", look.hatColor, bg);
    }
  // Shoulders.
  const bodies: Record<Look["body"], string> = {
    vest: " ▄█▀▀▀▀▀█▄ ",
    suit: " ▄███▼███▄ ",
    tie: " ▄███║███▄ ",
    dress: "  ▄█████▄  ",
    uniform: " ▄█▀█▀█▀█▄ ",
    jacket: " ▄███│███▄ ",
    coat: " ▄███████▄ ",
  };
  const b = bodies[look.body];
  for (let i = 0; i < 11; i++) {
    const ch = b[i];
    if (ch === " ") continue;
    const fg =
      ch === "▼"
        ? C.white
        : ch === "║"
          ? C.red
          : look.body === "uniform" && ch === "▀"
            ? C.gold
            : look.clothes;
    t.put(x + i, y + 5, ch, fg, bg);
  }
  t.text(x + 1, y + 6, "█████████", look.clothes, bg);
}

/** A meter like ███████░░░ for heat and such. */
export function meter(t: Term, x: number, y: number, w: number, frac: number, fg: string): void {
  const n = Math.round(Math.max(0, Math.min(1, frac)) * w);
  for (let i = 0; i < w; i++) t.put(x + i, y, i < n ? "█" : "░", i < n ? fg : C.dim);
}

/** Splits a long line into lines no wider than `w`, keeping the color for each. */
export function wrapLines(text: string, w: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      if (line && line.length + 1 + word.length > w) {
        out.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out;
}

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ],
  5: [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ],
  6: [
    [0, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [2, 2],
  ],
};

export const DIE_W = 9;
export const DIE_H = 5;

/**
 * A die, 9x5. Pass null for one still under the cup. `hot` picks out a die that counts toward
 * the bid; `dim` greys out one that doesn't.
 */
export function drawDie(
  t: Term,
  x: number,
  y: number,
  n: number | null,
  opts: { hot?: boolean; dim?: boolean } = {},
): void {
  if (n === null) {
    t.fill(x, y, DIE_W, DIE_H, "░", C.dim, C.ink);
    t.put(x + 4, y + 2, "?", C.gray, C.ink);
    return;
  }
  const bg = opts.hot ? C.yellow : opts.dim ? C.gray : C.paper;
  t.fill(x, y, DIE_W, DIE_H, " ", C.black, bg);
  for (const [cx, cy] of PIPS[n])
    t.put(x + 2 + cx * 2, y + 1 + cy, "●", n === 1 ? C.red : C.black, bg);
}
