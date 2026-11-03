import type { Game } from "../../game/game";
import { play, setMusicVolume, setVolume } from "./audio";
import { GamepadInput } from "./gamepad";
import { music, type TrackId } from "./music";
import { saveSettings, settings } from "./settings";
import { deleteSlot, writeSlot, writeSlotNow } from "./storage";
import { Term } from "./term";

export interface Screen {
  draw(t: Term, now: number): void;
  key(e: KeyboardEvent): void;
  /** True while something is animating and the screen must keep redrawing. */
  animating?(now: number): boolean;
  /** The walking screen: controller buttons map to walking actions instead of menu keys. */
  playing?: boolean;
  /** Music this screen wants (the top-most screen that asks wins). */
  music?: TrackId | null;
  /** The mouse moved over a grid cell (or left the window: null). */
  hover?(cell: { x: number; y: number } | null): void;
  /** Covers the whole screen, so screens underneath needn't be drawn. */
  opaque?: boolean;
}

/** A pretend key press, used for controller buttons. */
function fakeKey(code: string, repeat: boolean, shift = false): KeyboardEvent {
  return {
    code,
    key: "",
    repeat,
    shiftKey: shift,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    preventDefault() {},
  } as unknown as KeyboardEvent;
}

/** Owns the canvas, the screen stack, the current game and its save slot. */
export class App {
  readonly term = new Term();
  private stack: Screen[] = [];
  private dirty = true;
  private pad = new GamepadInput();
  game: Game | null = null;
  /** Which save slot the current game lives in. */
  slot = 0;
  private savedTurn = -1;
  /** Re-applies the window layout (after the text size changes). */
  relayout: () => void;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("No 2D canvas.");
    const resize = () => {
      this.term.fontScale = settings.textSize === "large" ? 1.14 : 1;
      this.term.layout(canvas, window.innerWidth, window.innerHeight);
      this.dirty = true;
    };
    this.relayout = resize;
    window.addEventListener("resize", resize);
    resize();
    setVolume(settings.volume / 10);
    setMusicVolume(settings.music / 10);
    window.addEventListener("keydown", (e) => {
      if (e.code === "F11") {
        e.preventDefault();
        this.toggleFullscreen();
        return;
      }
      // Keep the browser from scrolling, tabbing away or opening menus.
      const swallow = [
        "Tab",
        "Space",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Slash",
        "F1",
        "Backspace",
      ];
      if (swallow.includes(e.code)) e.preventDefault();
      this.dispatch(e);
    });
    canvas.addEventListener("mousemove", (e) => {
      const t = this.term;
      const x = Math.floor((e.offsetX - t.offX) / t.cellW);
      const y = Math.floor((e.offsetY - t.offY) / t.cellH);
      this.top()?.hover?.(x >= 0 && y >= 0 && x < t.cols && y < t.rows ? { x, y } : null);
      this.dirty = true;
    });
    canvas.addEventListener("mouseleave", () => {
      this.top()?.hover?.(null);
      this.dirty = true;
    });
    // Save on the way out: Electron asks first; a browser tab just closes.
    window.aceavenue?.onClosing(() => this.save());
    window.addEventListener("beforeunload", () => {
      const g = this.game;
      if (!window.aceavenue && g && !g.s.over) writeSlotNow(this.slot, g.summary(), g.save());
    });
    if (settings.fullscreen) void window.aceavenue?.setFullscreen(true);

    const frame = (now: number) => {
      const top = this.top();
      this.pad.poll(now, !!top?.playing, (code, repeat, shift) =>
        this.dispatch(fakeKey(code, repeat, shift)),
      );
      music.play(this.musicFor());
      const g = this.game;
      if (g?.sounds.length) {
        for (const s of g.sounds) play(s);
        g.sounds = [];
      }
      if (top && (this.dirty || top.animating?.(now))) {
        this.dirty = false;
        this.term.clear();
        // Draw from the last full-screen screen up, so pop-ups sit over what's beneath.
        let from = 0;
        for (let i = this.stack.length - 1; i >= 0; i--)
          if (this.stack[i].opaque) {
            from = i;
            break;
          }
        for (let i = from; i < this.stack.length; i++) this.stack[i].draw(this.term, now);
        this.term.draw(ctx);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** Which tune fits what is on screen. */
  private musicFor(): TrackId | null {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const m = this.stack[i].music;
      if (m !== undefined) return m;
    }
    const g = this.game;
    if (!g) return "title";
    return g.area.kind === "strip" ? "strip" : "casino";
  }

  private dispatch(e: KeyboardEvent): void {
    this.top()?.key(e);
    this.dirty = true;
  }

  top(): Screen | undefined {
    return this.stack[this.stack.length - 1];
  }

  push(s: Screen): void {
    this.stack.push(s);
    this.dirty = true;
  }

  pop(): void {
    this.stack.pop();
    this.dirty = true;
  }

  /** Pops screens until `s` is on top (or the stack is down to one). */
  popTo(s: Screen): void {
    while (this.stack.length > 1 && this.top() !== s) this.stack.pop();
    this.dirty = true;
  }

  /** Replaces the whole stack with one screen. */
  reset(s: Screen): void {
    this.stack = [s];
    this.dirty = true;
  }

  redraw(): void {
    this.dirty = true;
  }

  toggleFullscreen(): void {
    settings.fullscreen = !settings.fullscreen;
    saveSettings();
    void window.aceavenue?.setFullscreen(settings.fullscreen);
  }

  /** Saves the current game into its slot (not once the run is over). */
  async save(): Promise<void> {
    const g = this.game;
    if (!g || g.s.over) return;
    this.savedTurn = g.s.turn;
    await writeSlot(this.slot, g.summary(), g.save());
  }

  /** Saves every so often while playing. */
  autosave(): void {
    const g = this.game;
    if (g && g.s.turn - this.savedTurn >= 40) void this.save();
  }

  async forget(): Promise<void> {
    await deleteSlot(this.slot);
  }

  sound = play;
}
