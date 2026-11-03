import { C } from "../../game/colors";

export const COLS = 110;
export const ROWS = 37;

/** A grid of colored characters drawn to a canvas. Every screen draws into one of these. */
export class Term {
  readonly ch: string[];
  readonly fg: string[];
  readonly bg: string[];
  cellW = 12;
  cellH = 21;
  offX = 0;
  offY = 0;
  private fontSize = 16;
  /** Settings > Text size: draws characters a little bigger inside their cells. */
  fontScale = 1;

  constructor(
    readonly cols = COLS,
    readonly rows = ROWS,
  ) {
    const n = cols * rows;
    this.ch = new Array(n).fill(" ");
    this.fg = new Array(n).fill(C.light);
    this.bg = new Array(n).fill(C.black);
  }

  clear(): void {
    this.ch.fill(" ");
    this.fg.fill(C.light);
    this.bg.fill(C.black);
  }

  put(x: number, y: number, ch: string, fg: string = C.light, bg?: string): void {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    const i = y * this.cols + x;
    this.ch[i] = ch;
    this.fg[i] = fg;
    if (bg !== undefined) this.bg[i] = bg;
  }

  setBg(x: number, y: number, bg: string): void {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    this.bg[y * this.cols + x] = bg;
  }

  /** Writes text; returns the x after it. Clips at maxX. */
  text(
    x: number,
    y: number,
    s: string,
    fg: string = C.light,
    bg?: string,
    maxX = this.cols,
  ): number {
    for (const c of s) {
      if (x >= maxX) break;
      this.put(x++, y, c, fg, bg);
    }
    return x;
  }

  center(y: number, s: string, fg: string = C.light, x0 = 0, w = this.cols): void {
    this.text(x0 + Math.floor((w - s.length) / 2), y, s, fg);
  }

  fill(
    x: number,
    y: number,
    w: number,
    h: number,
    ch = " ",
    fg: string = C.light,
    bg: string = C.black,
  ): void {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) this.put(xx, yy, ch, fg, bg);
  }

  box(
    x: number,
    y: number,
    w: number,
    h: number,
    fg: string = C.gray,
    title?: string,
    titleFg: string = C.yellow,
  ): void {
    this.fill(x, y, w, h, " ", C.light, C.ink);
    for (let xx = x + 1; xx < x + w - 1; xx++) {
      this.put(xx, y, "─", fg);
      this.put(xx, y + h - 1, "─", fg);
    }
    for (let yy = y + 1; yy < y + h - 1; yy++) {
      this.put(x, yy, "│", fg);
      this.put(x + w - 1, yy, "│", fg);
    }
    this.put(x, y, "┌", fg);
    this.put(x + w - 1, y, "┐", fg);
    this.put(x, y + h - 1, "└", fg);
    this.put(x + w - 1, y + h - 1, "┘", fg);
    if (title) this.text(x + 2, y, ` ${title} `, titleFg);
  }

  /** Word-wraps text into lines no wider than `w`. */
  static wrap(s: string, w: number): string[] {
    const lines: string[] = [];
    for (const para of s.split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        if (line.length + word.length + (line ? 1 : 0) > w) {
          if (line) lines.push(line);
          line = word.length > w ? word.slice(0, w) : word;
        } else {
          line = line ? `${line} ${word}` : word;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  /** Fits the grid into the canvas's CSS size and sets up crisp drawing. */
  layout(canvas: HTMLCanvasElement, width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.cellW = Math.max(4, Math.floor(width / this.cols));
    this.cellH = Math.max(8, Math.floor(height / this.rows));
    // Keep characters roughly as tall as a terminal's.
    this.cellH = Math.min(this.cellH, Math.floor(this.cellW * 2.1));
    this.cellW = Math.min(this.cellW, Math.floor(this.cellH * 0.62));
    const cw = this.cellW * this.cols;
    const chh = this.cellH * this.rows;
    this.offX = Math.floor((width - cw) / 2);
    this.offY = Math.floor((height - chh) / 2);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const size = Math.floor(
      Math.min(
        this.cellH * 0.86 * this.fontScale,
        (this.cellW / 0.56) * this.fontScale,
        this.cellH * 0.98,
      ),
    );
    this.fontSize = size;
  }

  /**
   * Draws in device pixels with every rectangle snapped to whole pixels, so neighboring cells
   * meet exactly (on scaled displays, fractional edges left faint seams between cells).
   */
  draw(ctx: CanvasRenderingContext2D): void {
    const dpr = window.devicePixelRatio || 1;
    const { cellW, cellH, cols, offX, offY } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.black;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const rect: Rect = (x, y, w, h) => {
      const x0 = Math.round((offX + x) * dpr);
      const y0 = Math.round((offY + y) * dpr);
      ctx.fillRect(
        x0,
        y0,
        Math.round((offX + x + w) * dpr) - x0,
        Math.round((offY + y + h) * dpr) - y0,
      );
    };
    // Backgrounds, one rectangle per run of same-colored cells.
    for (let row = 0; row < this.rows; row++) {
      let x = 0;
      while (x < cols) {
        const i = row * cols + x;
        const bg = this.bg[i];
        let run = 1;
        while (x + run < cols && this.bg[i + run] === bg) run++;
        if (bg !== C.black) {
          ctx.fillStyle = bg;
          rect(x * cellW, row * cellH, run * cellW, cellH);
        }
        x += run;
      }
    }
    ctx.font = `${this.fontSize * dpr}px Consolas, "Cascadia Mono", "DejaVu Sans Mono", "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let last = "";
    for (let i = 0; i < this.ch.length; i++) {
      const c = this.ch[i];
      if (c === " ") continue;
      if (this.fg[i] !== last) {
        last = this.fg[i];
        ctx.fillStyle = last;
      }
      const x = (i % cols) * cellW;
      const y = Math.floor(i / cols) * cellH;
      // Block and line characters are drawn as shapes so they join up without gaps.
      if (!drawShape(rect, ctx, c, x, y, cellW, cellH))
        ctx.fillText(c, (offX + x + cellW / 2) * dpr, (offY + y + cellH / 2 + 1) * dpr);
    }
  }
}

type Rect = (x: number, y: number, w: number, h: number) => void;

/** Draws block/shade characters as rectangles so they tile perfectly. */
function drawShape(
  fillRect: Rect,
  ctx: CanvasRenderingContext2D,
  c: string,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  switch (c) {
    case "█":
      fillRect(x, y, w, h);
      return true;
    case "▄":
      fillRect(x, y + h / 2, w, h / 2);
      return true;
    case "▀":
      fillRect(x, y, w, h / 2);
      return true;
    case "─":
      fillRect(x, y + Math.floor(h / 2), w, 1);
      return true;
    case "│":
      fillRect(x + Math.floor(w / 2), y, 1, h);
      return true;
    case "┌":
      fillRect(x + Math.floor(w / 2), y + Math.floor(h / 2), Math.ceil(w / 2), 1);
      fillRect(x + Math.floor(w / 2), y + Math.floor(h / 2), 1, Math.ceil(h / 2));
      return true;
    case "┐":
      fillRect(x, y + Math.floor(h / 2), Math.floor(w / 2) + 1, 1);
      fillRect(x + Math.floor(w / 2), y + Math.floor(h / 2), 1, Math.ceil(h / 2));
      return true;
    case "└":
      fillRect(x + Math.floor(w / 2), y + Math.floor(h / 2), Math.ceil(w / 2), 1);
      fillRect(x + Math.floor(w / 2), y, 1, Math.floor(h / 2) + 1);
      return true;
    case "┘":
      fillRect(x, y + Math.floor(h / 2), Math.floor(w / 2) + 1, 1);
      fillRect(x + Math.floor(w / 2), y, 1, Math.floor(h / 2) + 1);
      return true;
    case "░":
    case "▒":
    case "▓": {
      const a = c === "░" ? 0.25 : c === "▒" ? 0.5 : 0.75;
      ctx.globalAlpha = a;
      fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      return true;
    }
    default:
      return false;
  }
}
