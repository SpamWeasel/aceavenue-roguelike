import { C } from "../../../game/colors";
import { ALL_CASINOS, CASINO_ORDER, CASINOS } from "../../../game/data/casinos";
import { ITEMS, SKILL_ORDER, SKILLS } from "../../../game/data/items";
import { DIFFICULTY, type Difficulty, Game, money } from "../../../game/game";
import { SAVE_SLOTS, type SlotInfo } from "../../../shared/bridge";
import type { App, Screen } from "../app";
import { setMusicVolume, setVolume } from "../audio";
import { isBack, isConfirm } from "../input";
import { addRecord, loadRecords, type RunRecord } from "../records";
import {
  ACTION_LABEL,
  ACTIONS,
  type Action,
  bindKey,
  keyName,
  resetKeys,
  saveSettings,
  settings,
} from "../settings";
import { appInfo, deleteSlot, listSlots, readSlot } from "../storage";
import { COLS, ROWS, type Term } from "../term";
import { wrapLines } from "./draw";
import { PlayScreen } from "./play";

const LOGO = String.raw`
    _    ____ _____      ___     _______ _   _ _   _ _____
   / \  / ___| ____|    / \ \   / / ____| \ | | | | | ____|
  / _ \| |   |  _|     / _ \ \ / /|  _| |  \| | | | |  _|
 / ___ \ |___| |___   / ___ \ V / | |___| |\  | |_| | |___
/_/   \_\____|_____| /_/   \_\_/  |_____|_| \_|\___/|_____|
`
  .split("\n")
  .filter((l) => l.length);

const up = (e: KeyboardEvent) => e.code === "ArrowUp" || e.code === "Numpad8";
const down = (e: KeyboardEvent) => e.code === "ArrowDown" || e.code === "Numpad2";
const left = (e: KeyboardEvent) => e.code === "ArrowLeft" || e.code === "Numpad4";
const right = (e: KeyboardEvent) => e.code === "ArrowRight" || e.code === "Numpad6";

function drawOptions(
  t: Term,
  x: number,
  y: number,
  options: string[],
  cursor: number,
  step = 2,
): void {
  options.forEach((o, i) => {
    const sel = i === cursor;
    t.text(x, y + i * step, sel ? `► ${o}` : `  ${o}`, sel ? C.yellow : C.light);
  });
}

export function startGame(app: App, game: Game, slot: number): PlayScreen {
  app.game = game;
  app.slot = slot;
  const play = new PlayScreen(app);
  app.reset(play);
  void app.save();
  (window as unknown as { __ace?: unknown }).__ace = { app, game, play };
  return play;
}

/** Loads a slot and starts playing it; returns an error message on failure. */
async function loadSlot(app: App, slot: number): Promise<string | null> {
  const saved = await readSlot(slot);
  if (!saved) return "That save couldn't be read, and no backup was found.";
  try {
    startGame(app, Game.load(saved.data), slot);
    if (saved.recovered)
      app.push(
        new NoticeScreen(
          app,
          "SAVE RECOVERED",
          [
            "The latest save was damaged, so the newest backup",
            "was loaded instead. You may have lost a few minutes.",
          ],
          C.amber,
        ),
      );
    return null;
  } catch (err) {
    return `Couldn't load the save: ${(err as Error).message}`;
  }
}

function formatWhen(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** A neon marquee of card suits. */
function marquee(t: Term, y: number, now: number): void {
  const suits = "♠♥♦♣";
  for (let x = 2; x < COLS - 2; x += 2) {
    const k = (x / 2 + Math.floor(now / 180)) % 4;
    const lit = (x / 2 + Math.floor(now / 180)) % 6 === 0;
    t.put(x, y, suits[k], lit ? C.yellow : k === 1 || k === 2 ? C.darkRed : C.dim);
  }
}

export class TitleScreen implements Screen {
  readonly opaque = true;
  private cursor = 0;
  private slots: SlotInfo[] = [];
  private error = "";
  private version = "";

  constructor(private app: App) {
    void listSlots().then((s) => {
      this.slots = s;
      app.redraw();
    });
    void appInfo().then((i) => {
      this.version = i.version;
      app.redraw();
    });
  }

  private newest(): SlotInfo | undefined {
    return [...this.slots]
      .filter((s) => !s.damaged)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
  }

  private options(): string[] {
    return [
      ...(this.newest() ? ["Continue"] : []),
      "New Game",
      ...(this.slots.length ? ["Load Game"] : []),
      "Settings",
      "Hall of Fame",
      "How to Play",
      ...(window.aceavenue ? ["Quit"] : []),
    ];
  }

  key(e: KeyboardEvent): void {
    const opts = this.options();
    if (up(e)) this.cursor = (this.cursor + opts.length - 1) % opts.length;
    else if (down(e)) this.cursor = (this.cursor + 1) % opts.length;
    else if (isConfirm(e)) {
      const choice = opts[this.cursor];
      const newest = this.newest();
      if (choice === "Continue" && newest) {
        void loadSlot(this.app, newest.slot).then((err) => {
          if (err) this.error = err;
          this.app.redraw();
        });
      } else if (choice === "New Game") this.app.push(new CreateScreen(this.app, this.slots));
      else if (choice === "Load Game") this.app.push(new SlotsScreen(this.app));
      else if (choice === "Settings") this.app.push(new SettingsScreen(this.app));
      else if (choice === "Hall of Fame") this.app.push(new RecordsScreen(this.app));
      else if (choice === "How to Play") this.app.push(new HelpScreen(this.app));
      else if (choice === "Quit") window.aceavenue?.quit();
    }
  }

  draw(t: Term, now: number): void {
    marquee(t, 1, now);
    const x0 = Math.floor((COLS - LOGO[0].length) / 2);
    const flicker = Math.floor(now / 90) % 47 === 0;
    LOGO.forEach((l, i) => {
      t.text(x0, 4 + i, l, flicker ? C.dim : [C.magenta, C.pink, C.amber, C.yellow, C.gold][i]);
    });
    t.center(10, "A casino roguelike", C.light);
    t.center(11, "♠ ♥ ♦ ♣", C.red);
    marquee(t, 13, now + 900);
    const opts = this.options();
    opts.forEach((o, i) => {
      const sel = i === this.cursor;
      t.center(16 + i * 2, sel ? `► ${o} ◄` : o, sel ? C.yellow : C.light);
    });
    const newest = this.newest();
    if (newest && opts[this.cursor] === "Continue")
      t.center(16 + opts.length * 2, newest.title, C.gray);
    if (this.error) t.center(ROWS - 5, this.error, C.red);
    t.center(ROWS - 3, "Count the cards. Read the tells. Break the bank.", C.gray);
    t.center(ROWS - 2, "↑↓ and Enter  (or a controller)", C.dim);
    if (this.version) t.text(COLS - this.version.length - 3, ROWS - 1, `v${this.version}`, C.dim);
  }

  animating(): boolean {
    return true;
  }
}

class CreateScreen implements Screen {
  readonly opaque = true;
  private name = "";
  private difficulty: Difficulty = "normal";
  private slot: number;
  private row = 0;
  private armed = false;

  constructor(
    private app: App,
    private slots: SlotInfo[],
  ) {
    const used = new Set(slots.map((s) => s.slot));
    this.slot = [...Array(SAVE_SLOTS).keys()].find((n) => !used.has(n)) ?? 0;
  }

  private taken(): SlotInfo | undefined {
    return this.slots.find((s) => s.slot === this.slot);
  }

  key(e: KeyboardEvent): void {
    if (e.code === "Escape") {
      this.app.pop();
      return;
    }
    if (up(e) || down(e)) {
      this.row = (this.row + (up(e) ? 2 : 1)) % 3;
      return;
    }
    const step = left(e) ? -1 : right(e) ? 1 : 0;
    if (step && this.row > 0) {
      this.armed = false;
      if (this.row === 1) {
        const all: Difficulty[] = ["easy", "normal", "hard"];
        this.difficulty = all[(all.indexOf(this.difficulty) + step + 3) % 3];
      } else this.slot = (this.slot + step + SAVE_SLOTS) % SAVE_SLOTS;
      return;
    }
    if (e.code === "Enter" || e.code === "NumpadEnter") {
      if (this.taken() && !this.armed) {
        this.armed = true;
        return;
      }
      const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
      const game = Game.create(this.name, this.difficulty, seed);
      void deleteSlot(this.slot).then(() => startGame(this.app, game, this.slot));
      return;
    }
    if (this.row === 0) {
      if (e.code === "Backspace") this.name = this.name.slice(0, -1);
      else if (e.key.length === 1 && /[A-Za-z0-9 '\-.]/.test(e.key) && this.name.length < 14)
        this.name += e.key;
    }
  }

  draw(t: Term, now: number): void {
    const x = 22;
    const y = 5;
    t.box(x, y, 66, 25, C.magenta, "New Game", C.pink);
    const head = (row: number, text: string, yy: number) =>
      t.text(x + 3, yy, text, this.row === row ? C.yellow : C.light);
    head(0, "What do they call you?", y + 2);
    const cursor = this.row === 0 && Math.floor(now / 500) % 2 === 0 ? "_" : " ";
    t.text(x + 5, y + 3, `${this.name}${cursor}`, C.white, C.dark);
    for (let i = this.name.length + 1; i < 16; i++) t.put(x + 5 + i, y + 3, " ", C.white, C.dark);
    t.text(x + 24, y + 3, this.name ? "" : '(blank = "Ace")', C.dim);

    head(1, "Difficulty:", y + 6);
    (["easy", "normal", "hard"] as Difficulty[]).forEach((d, i) => {
      const sel = d === this.difficulty;
      t.text(
        x + 5 + i * 14,
        y + 7,
        sel ? `► ${DIFFICULTY[d].label}` : `  ${DIFFICULTY[d].label}`,
        sel ? [C.lime, C.yellow, C.red][i] : C.gray,
      );
    });
    wrapLines(DIFFICULTY[this.difficulty].text, 58).forEach((l, i) =>
      t.text(x + 5, y + 8 + i, l, C.gray),
    );

    head(2, "Save slot:", y + 11);
    for (let n = 0; n < SAVE_SLOTS; n++) {
      const sel = n === this.slot;
      t.text(
        x + 5 + n * 14,
        y + 12,
        sel ? `► Slot ${n + 1}` : `  Slot ${n + 1}`,
        sel ? C.cyan : C.gray,
      );
    }
    const taken = this.taken();
    t.text(
      x + 5,
      y + 13,
      taken ? `In use: ${taken.title}` : "Empty",
      taken ? C.orange : C.dim,
      undefined,
      x + 64,
    );
    if (taken && this.armed)
      t.text(x + 5, y + 14, "Press Enter again to replace that saved game.", C.red);

    wrapLines(
      "Going broke ends your run for good - this is a roguelike. The game saves as you go, and every casino floor is laid out fresh for each new game.",
      58,
    ).forEach((l, i) => t.text(x + 5, y + 16 + i, l, C.gray));
    t.text(x + 3, y + 22, "Type a name  ↑↓ choose row  ←→ change  Enter start  Esc back", C.dim);
  }

  animating(): boolean {
    return true;
  }
}

class SlotsScreen implements Screen {
  private cursor = 0;
  private slots: SlotInfo[] = [];
  private armedDelete = -1;
  private message = "";

  constructor(private app: App) {
    this.refresh();
  }

  private refresh(): void {
    void listSlots().then((s) => {
      this.slots = s;
      this.app.redraw();
    });
  }

  key(e: KeyboardEvent): void {
    if (isBack(e)) {
      this.app.pop();
      return;
    }
    if (up(e)) this.cursor = (this.cursor + SAVE_SLOTS - 1) % SAVE_SLOTS;
    else if (down(e)) this.cursor = (this.cursor + 1) % SAVE_SLOTS;
    else if (isConfirm(e)) {
      if (!this.slots.some((s) => s.slot === this.cursor)) return;
      void loadSlot(this.app, this.cursor).then((err) => {
        if (err) this.message = err;
        this.app.redraw();
      });
    } else if (e.code === "Delete" || e.code === "KeyD") {
      if (!this.slots.some((s) => s.slot === this.cursor)) return;
      if (this.armedDelete !== this.cursor) {
        this.armedDelete = this.cursor;
        this.message = "Press Delete again to erase this saved game for good.";
        return;
      }
      this.armedDelete = -1;
      this.message = "Deleted.";
      void deleteSlot(this.cursor).then(() => this.refresh());
    }
    if (!(e.code === "Delete" || e.code === "KeyD")) this.armedDelete = -1;
  }

  draw(t: Term): void {
    const x = 20;
    const y = 8;
    t.box(x, y, 70, 16, C.cyan, "Load Game", C.cyan);
    for (let n = 0; n < SAVE_SLOTS; n++) {
      const s = this.slots.find((q) => q.slot === n);
      const sel = n === this.cursor;
      const yy = y + 2 + n * 3;
      if (sel) t.fill(x + 1, yy, 68, 2, " ", C.light, C.dark);
      t.text(
        x + 2,
        yy,
        `${sel ? "►" : " "} Slot ${n + 1}`,
        sel ? C.yellow : C.light,
        sel ? C.dark : undefined,
      );
      t.text(
        x + 14,
        yy,
        s ? s.title : "Empty",
        s ? (s.damaged ? C.orange : C.white) : C.dim,
        sel ? C.dark : undefined,
        x + 69,
      );
      if (s?.savedAt)
        t.text(x + 14, yy + 1, `Saved ${formatWhen(s.savedAt)}`, C.gray, sel ? C.dark : undefined);
    }
    if (this.message) t.text(x + 3, y + 12, this.message, C.orange);
    t.text(x + 3, y + 14, "↑↓ choose   Enter load   Delete erase   Esc back", C.dim);
  }
}

export class SettingsScreen implements Screen {
  private cursor = 0;

  constructor(private app: App) {}

  private options(): string[] {
    return [
      `Sound volume: ${"■".repeat(settings.volume)}${"·".repeat(10 - settings.volume)} ${settings.volume * 10}%`,
      `Music volume: ${"■".repeat(settings.music)}${"·".repeat(10 - settings.music)} ${settings.music * 10}%`,
      `Text size: ${settings.textSize === "large" ? "Large" : "Normal"}`,
      `Fast animations: ${settings.fast ? "On" : "Off"}`,
      ...(window.aceavenue ? [`Fullscreen: ${settings.fullscreen ? "On" : "Off"}  (F11)`] : []),
      "Change keys...",
      "Back",
    ];
  }

  key(e: KeyboardEvent): void {
    const opts = this.options();
    if (isBack(e)) {
      this.app.pop();
      return;
    }
    if (up(e)) this.cursor = (this.cursor + opts.length - 1) % opts.length;
    else if (down(e)) this.cursor = (this.cursor + 1) % opts.length;
    const o = opts[this.cursor];
    const conf = isConfirm(e);
    const step = left(e) ? -1 : right(e) ? 1 : conf ? 1 : 0;
    if (!step) return;
    if (o.startsWith("Sound")) {
      settings.volume = conf
        ? settings.volume === 0
          ? 7
          : 0
        : Math.max(0, Math.min(10, settings.volume + step));
      setVolume(settings.volume / 10);
      this.app.sound("coin");
    } else if (o.startsWith("Music")) {
      settings.music = conf
        ? settings.music === 0
          ? 5
          : 0
        : Math.max(0, Math.min(10, settings.music + step));
      setMusicVolume(settings.music / 10);
    } else if (o.startsWith("Text")) {
      settings.textSize = settings.textSize === "large" ? "normal" : "large";
      this.app.relayout();
    } else if (o.startsWith("Fast")) settings.fast = !settings.fast;
    else if (o.startsWith("Fullscreen")) {
      this.app.toggleFullscreen();
      return;
    } else if (o.startsWith("Change") && conf) {
      this.app.push(new KeysScreen(this.app));
      return;
    } else if (o === "Back" && conf) {
      this.app.pop();
      return;
    }
    saveSettings();
  }

  draw(t: Term): void {
    const opts = this.options();
    const x = 22;
    const y = 6;
    t.box(x, y, 66, opts.length * 2 + 10, C.cyan, "Settings", C.cyan);
    drawOptions(t, x + 3, y + 2, opts, this.cursor);
    const yy = y + 3 + opts.length * 2;
    t.text(x + 3, yy, "Controllers work everywhere: plug one in and press A.", C.gray);
    t.text(x + 3, yy + 1, "Walking: stick/d-pad move, A wait, Y sheet, LB log, View help.", C.gray);
    t.text(x + 3, yy + 2, "Tables: A confirm, B back, X deal/spin/roll, Y chip size.", C.gray);
    t.text(x + 3, yy + 4, "↑↓ choose   ←→ or Enter change   Esc back", C.dim);
  }
}

class KeysScreen implements Screen {
  private cursor = 0;
  private listening = false;
  private message = "";

  constructor(private app: App) {}

  private rows(): (Action | "reset")[] {
    return [...ACTIONS, "reset"];
  }

  key(e: KeyboardEvent): void {
    const rows = this.rows();
    if (this.listening) {
      this.listening = false;
      if (e.code === "Escape") {
        this.message = "Cancelled.";
        return;
      }
      const action = rows[this.cursor] as Action;
      bindKey(action, e.code);
      this.message = `${ACTION_LABEL[action]} is now ${keyName(e.code)}.`;
      return;
    }
    if (isBack(e)) {
      this.app.pop();
      return;
    }
    if (e.code === "ArrowUp") this.cursor = (this.cursor + rows.length - 1) % rows.length;
    else if (e.code === "ArrowDown") this.cursor = (this.cursor + 1) % rows.length;
    else if (e.code === "Enter" || e.code === "NumpadEnter") {
      if (rows[this.cursor] === "reset") {
        resetKeys();
        this.message = "All keys are back to the defaults.";
      } else {
        this.listening = true;
        this.message = `Press the new key for ${ACTION_LABEL[rows[this.cursor] as Action]} (Esc cancels).`;
      }
    }
  }

  draw(t: Term): void {
    const rows = this.rows();
    const x = 18;
    const y = 4;
    t.box(x, y, 74, rows.length + 8, C.cyan, "Change Keys", C.cyan);
    rows.forEach((r, i) => {
      const sel = i === this.cursor;
      const yy = y + 2 + i;
      if (sel) t.fill(x + 1, yy, 72, 1, " ", C.light, C.dark);
      if (r === "reset") {
        t.text(
          x + 3,
          yy,
          `${sel ? "►" : " "} Reset all keys to defaults`,
          sel ? C.yellow : C.light,
          sel ? C.dark : undefined,
        );
        return;
      }
      t.text(
        x + 3,
        yy,
        `${sel ? "►" : " "} ${ACTION_LABEL[r]}`,
        sel ? C.yellow : C.light,
        sel ? C.dark : undefined,
      );
      const keys = settings.keys[r];
      t.text(
        x + 30,
        yy,
        keyName(keys[0]),
        this.listening && sel ? C.red : C.white,
        sel ? C.dark : undefined,
      );
      const others = keys.slice(1).map(keyName).join(", ");
      if (others) t.text(x + 42, yy, `also ${others}`, C.dim, sel ? C.dark : undefined, x + 73);
    });
    t.text(x + 3, y + rows.length + 3, this.message, this.listening ? C.yellow : C.lime);
    t.text(
      x + 3,
      y + rows.length + 5,
      "↑↓ choose  Enter change  Esc back  (tables use their own keys)",
      C.dim,
    );
  }
}

class RecordsScreen implements Screen {
  private list: RunRecord[] = [];

  constructor(private app: App) {
    void loadRecords().then((l) => {
      this.list = l;
      app.redraw();
    });
  }

  key(e: KeyboardEvent): void {
    if (isBack(e) || isConfirm(e)) this.app.pop();
  }

  draw(t: Term): void {
    const x = 6;
    const y = 4;
    t.box(x, y, COLS - 12, 28, C.gold, "Hall of Fame", C.gold);
    t.text(
      x + 3,
      y + 2,
      "Name            Result   Difficulty  Furthest casino        Chips  Best bankroll  Date",
      C.gray,
    );
    if (!this.list.length) t.text(x + 3, y + 4, "No finished runs yet.", C.dim);
    this.list.slice(0, 20).forEach((r, i) => {
      const yy = y + 4 + i;
      const col = r.result === "won" ? C.gold : C.light;
      t.text(x + 3, yy, r.name.slice(0, 14), col);
      t.text(
        x + 19,
        yy,
        r.result === "won" ? "KING" : "Busted",
        r.result === "won" ? C.gold : C.red,
      );
      t.text(x + 28, yy, r.difficulty, C.light);
      t.text(x + 40, yy, r.result === "won" ? "The Pinnacle" : r.reached, C.light);
      t.text(x + 63, yy, `${r.chips}/5`, C.light);
      t.text(x + 70, yy, money(r.peak), C.lime);
      t.text(x + 85, yy, r.date, C.gray);
    });
    t.text(x + 3, y + 26, "Enter / Esc back", C.dim);
  }
}

const HELP_PAGES: { title: string; lines: string[] }[] = [
  {
    title: "The goal",
    lines: [
      "You've come to Ace Avenue with a few hundred dollars and big ideas.",
      "",
      "Each casino has three HIGH ROLLERS standing by their private tables. Walk into one to",
      "talk, then challenge them to blackjack or five-card draw. You both put up their stake",
      "and play until one of you is broke. Clean them out to win their money (and often a",
      "lucky charm).",
      "",
      "Beat all three and the VIP room opens. Beat the BOSS inside to win the casino's",
      "GOLDEN CHIP - the next casino's doorman won't let you in without it.",
      "",
      "Five casinos: the Rusty Spur, the Coral Grotto, the Starlight Lounge, the Velvet Fox,",
      "and the Pinnacle, where the Baron plays for $100,000. Beat him to win the game.",
      "",
      "Once you hold the Coral Grotto's chip, the riverboat MAGNOLIA BELLE lets you aboard",
      "at the pier, at the far east end of the Avenue. It's off the road to the Baron, but its",
      "captain knows a secret about him.",
      "",
      "If you go broke with nothing to pawn and Vinnie won't lend you more, your run is over.",
    ],
  },
  {
    title: "Getting around",
    lines: [
      "Move with the arrow keys, the number pad, or Q W E / A D / Z X C (diagonals too).",
      "S waits a turn. Walk INTO things to use them: tables, slot machines, the bar,",
      "people, and the doors along the Avenue.",
      "",
      "I opens your sheet (skills, pockets, progress). M shows the message log.",
      "Point the mouse at anything for a description in the side panel.",
      "",
      "The house games on the casino floor are how you build a bankroll between duels:",
      "  d  Blackjack tables (some pay 3:2 for a blackjack, some only 6:5 - read the sign)",
      "  $  Slot machines (each one is loose, fair or tight)",
      "  ◎  Roulette (from the Coral Grotto on)",
      "  •  Craps (from the Starlight Lounge on)",
      "  ▣  Video poker - Jacks or Better (read the pay table on the glass!)",
      "  P B T  Baccarat (from the Starlight Lounge on)",
      "  ▒~  Chuck-a-luck, three dice in a birdcage (on the riverboat)",
      "  ♛  The tournament table: one blackjack tournament a night",
      "The cashier cages are the Players' Club desk: house play earns points for perks.",
      "",
      "Gamblers (☺) know things. A white ☺ has gossip to sell: which slot is loose, which",
      "wheel is worn, and what a high roller does when they're bluffing.",
    ],
  },
  {
    title: "Heat",
    lines: [
      "Casinos don't like winners. HEAT builds when you:",
      "  - win big on a single hand or spin,",
      "  - hit a slot jackpot,",
      "  - jump your blackjack bet way up when the count is good (they know what that means),",
      "  - use cheating gear like the Peek Ring.",
      "Heat doubles at tables the PIT BOSS (Ω) is standing near.",
      "",
      "At 100 heat security walks you out, and you're banned until it cools. Heat cools a",
      "little every few turns, Club Soda at the bar knocks some off, and a night at the",
      "Sleepy Ace Motel wipes it everywhere.",
      "",
      "Duels with high rollers never cause heat.",
    ],
  },
  {
    title: "Skills, charms and drinks",
    lines: [
      "Professor Odds' Academy on the Avenue teaches skills:",
      "  Card Sense  - blackjack strategy hints, then the running count, then the true count",
      "  Poker Read  - tells you what an opponent's habits mean",
      "  Poker Face  - opponents fold to your bets more often",
      "  Wheel Watch - roulette history, then spotting worn wheels",
      "  Slot Sense  - telling loose machines from tight ones",
      "  Charm       - less heat, cheaper drinks, better gossip",
      "",
      "Lady Luck Charms sells lucky charms that add to skills or bend luck your way.",
      "Honest Abe's Pawn buys and sells second-hand (and sometimes shady) goods.",
      "Drinks at the bar (or from a waitress, w) boost a skill for a while.",
      "Vinnie's Easy Money lends cash. Pay it back on time.",
    ],
  },
  {
    title: "Around the floor",
    lines: [
      "Casino floors change every visit. Keep an eye out for:",
      "",
      '  D  "Dutch" Calloway, your rival. He plays five-card draw for a quarter of your',
      "     bankroll. Beat him three times and he'll part with his lucky coin.",
      "  ☻  A tipsy millionaire who wants to cut the deck with you. High card wins, and",
      "     he's so generous that ties go to you.",
      "  ☺  A pickpocket hides among the gamblers. Walk into him first and you catch him;",
      "     let him sidle up beside you and your wallet gets lighter. Charm helps you notice.",
      "  d  A gold, blinking dealer means LUCKY HOUR: a blackjack pays 2 to 1 at that table.",
      "",
      "Video poker is the closest thing to a fair game in the house. A 9/6 machine (9 for a",
      "full house, 6 for a flush) pays back about 99.5% with good play; a 6/5 machine only 95%.",
      "With Card Sense, the machine shows which cards the book would hold (press B).",
    ],
  },
  {
    title: "Poker duels",
    lines: [
      "Five-card draw, heads up. Both players ante, then bet. You can then throw away up to",
      "three cards (four if the card you keep is an ace) and draw new ones. Then a second,",
      "bigger round of betting and the showdown. Bets are fixed sizes; up to three raises.",
      "",
      "C checks or calls, B bets or raises, F folds. When drawing, press 1-5 to mark cards,",
      "then D (or the Draw button) to draw.",
      "",
      "Watch your opponent. Everyone has habits: something they do with a strong hand, and",
      "something they do when they're weak or bluffing. With Poker Read you'll know what",
      "each habit means; without it, you'll have to learn them yourself. Good poker faces",
      "hide their tells more often.",
      "",
      "Opponents notice when you bluff and they catch you. Bluff too often and they'll call.",
    ],
  },
  {
    title: "Tournament night",
    lines: [
      "Every casino runs one blackjack tournament a night at its tournament table (♛).",
      "Pay the entry fee and sit down with four other players: some of the casino's high",
      "rollers, maybe Dutch, and the tournament regulars who play all along the Avenue.",
      "",
      "Everyone starts with 1,000 tournament chips (they aren't money) and plays ten hands",
      "against one dealer. Bets are 10 to 500. Six decks, the dealer stands on soft 17,",
      "blackjack pays 3:2, double on any two cards, no splits and no insurance.",
      "",
      "Whoever has the most chips after ten hands wins 3.5 times the entry fee and a gold",
      "trophy; second place wins 1.5 times the fee. Tied players split their prizes.",
      "",
      "You're not playing the house, you're playing the table. Early on, small bets keep you",
      "alive. In the last few hands, look at the leader: if you're behind, bet enough to",
      "catch up; if you're ahead, bet small and make them come to you.",
      "",
      "Played tonight? The next one is tomorrow night (a night at the motel gets you there).",
      "Win a trophy at every casino, the riverboat too, for a full shelf.",
    ],
  },
  {
    title: "Liar's dice duels",
    lines: [
      "The riverboat crowd plays liar's dice. You each have five dice under a cup, and you",
      "only see your own. ONES ARE WILD: they count as every face.",
      "",
      "Take turns bidding how many dice of one face are on the WHOLE table, yours and theirs.",
      'Each bid must be higher: more dice, or the same number of a higher face ("3 fours"',
      'beats "3 threes"; "4 twos" beats both). Instead of bidding, you can call "Liar!".',
      "Up come the cups. If there are at least that many, the caller loses a die; if not,",
      "the bidder does. Whoever lost a die opens the next round.",
      "",
      "The last one with dice takes the whole pot. Walk away early and you keep a fifth of",
      "the stake for every die you still have.",
      "",
      "Up/Down sets how many, Left/Right (or 2-6) sets the face, Enter bids, L calls.",
      "",
      "On average, a third of the dice you can't see will match any face. Their bids give",
      "their hand away a little (or they're lying). Poker Read works on dice players' tells",
      "too, Poker Face hides your bluffs, and Card Sense works out the odds of a bid for you.",
    ],
  },
];

export class HelpScreen implements Screen {
  readonly opaque = true;
  private page = 0;

  constructor(private app: App) {}

  key(e: KeyboardEvent): void {
    if (isBack(e)) this.app.pop();
    else if (left(e) || up(e)) this.page = Math.max(0, this.page - 1);
    else if (right(e) || down(e) || isConfirm(e)) {
      if (this.page === HELP_PAGES.length - 1 && isConfirm(e)) this.app.pop();
      else this.page = Math.min(HELP_PAGES.length - 1, this.page + 1);
    }
  }

  draw(t: Term): void {
    const p = HELP_PAGES[this.page];
    t.box(4, 2, COLS - 8, ROWS - 4, C.yellow, `How to Play - ${p.title}`, C.yellow);
    p.lines.forEach((l, i) => t.text(8, 5 + i, l, C.light));
    t.text(
      8,
      ROWS - 4,
      `Page ${this.page + 1} of ${HELP_PAGES.length}    ←→ turn pages   Esc close`,
      C.dim,
    );
  }
}

/** A simple message box. */
export class NoticeScreen implements Screen {
  constructor(
    private app: App,
    private title: string,
    private lines: string[],
    private color: string = C.yellow,
  ) {}

  key(e: KeyboardEvent): void {
    if (isConfirm(e) || isBack(e)) this.app.pop();
  }

  draw(t: Term): void {
    const wrapped = this.lines.flatMap((l) => (l ? wrapLines(l, 64) : [""]));
    const w = 72;
    const h = wrapped.length + 6;
    const x = Math.floor((COLS - w) / 2);
    const y = Math.floor((ROWS - h) / 2) - 2;
    t.box(x, y, w, h, this.color, this.title, this.color);
    wrapped.forEach((l, i) => t.center(y + 2 + i, l, C.white, x, w));
    t.center(y + h - 2, "Enter", C.dim, x, w);
  }
}

/** A yes/no question. */
export class ConfirmScreen implements Screen {
  private yes = false;

  constructor(
    private app: App,
    private question: string,
    private onYes: () => void,
  ) {}

  key(e: KeyboardEvent): void {
    if (left(e) || right(e) || up(e) || down(e)) this.yes = !this.yes;
    else if (e.code === "KeyY") {
      this.app.pop();
      this.onYes();
    } else if (isBack(e) || e.code === "KeyN") this.app.pop();
    else if (isConfirm(e)) {
      this.app.pop();
      if (this.yes) this.onYes();
    }
  }

  draw(t: Term): void {
    const lines = wrapLines(this.question, 56);
    const w = 64;
    const h = lines.length + 6;
    const x = Math.floor((COLS - w) / 2);
    const y = 13;
    t.box(x, y, w, h, C.amber);
    lines.forEach((l, i) => t.center(y + 2 + i, l, C.white, x, w));
    const yy = y + h - 2;
    t.text(x + 20, yy, " Yes ", this.yes ? C.black : C.light, this.yes ? C.yellow : C.dark);
    t.text(x + 36, yy, " No ", !this.yes ? C.black : C.light, !this.yes ? C.yellow : C.dark);
  }
}

export class PauseScreen implements Screen {
  private cursor = 0;

  constructor(private app: App) {}

  private options(): string[] {
    return [
      "Back to the game",
      "Your sheet",
      "Settings",
      "How to play",
      "Save and go to the title screen",
      ...(window.aceavenue ? ["Save and quit"] : []),
    ];
  }

  key(e: KeyboardEvent): void {
    const opts = this.options();
    if (isBack(e)) {
      this.app.pop();
      return;
    }
    if (up(e)) this.cursor = (this.cursor + opts.length - 1) % opts.length;
    else if (down(e)) this.cursor = (this.cursor + 1) % opts.length;
    else if (isConfirm(e)) {
      const o = opts[this.cursor];
      if (o.startsWith("Back")) this.app.pop();
      else if (o === "Your sheet") {
        this.app.pop();
        this.app.push(new SheetScreen(this.app));
      } else if (o === "Settings") this.app.push(new SettingsScreen(this.app));
      else if (o === "How to play") this.app.push(new HelpScreen(this.app));
      else if (o.startsWith("Save and go")) {
        void this.app.save().then(() => {
          this.app.game = null;
          this.app.reset(new TitleScreen(this.app));
        });
      } else if (o === "Save and quit") void this.app.save().then(() => window.aceavenue?.quit());
    }
  }

  draw(t: Term): void {
    const opts = this.options();
    const w = 50;
    const x = Math.floor((COLS - w) / 2);
    const y = 9;
    t.box(x, y, w, opts.length * 2 + 4, C.yellow, "Menu");
    drawOptions(t, x + 4, y + 2, opts, this.cursor);
  }
}

/** Your skills, pockets and progress along the Avenue. */
export class SheetScreen implements Screen {
  readonly opaque = true;
  private cursor = 0;

  constructor(private app: App) {}

  get game(): Game {
    return this.app.game as Game;
  }

  key(e: KeyboardEvent): void {
    const n = Math.max(1, this.game.s.pockets.length);
    if (isBack(e) || isConfirm(e) || e.code === "KeyI" || e.code === "KeyP") this.app.pop();
    else if (up(e)) this.cursor = (this.cursor + n - 1) % n;
    else if (down(e)) this.cursor = (this.cursor + 1) % n;
  }

  draw(t: Term): void {
    const g = this.game;
    const s = g.s;
    t.box(
      2,
      1,
      COLS - 4,
      ROWS - 2,
      C.yellow,
      `${s.name} - ${DIFFICULTY[s.difficulty].label}`,
      C.yellow,
    );
    let y = 3;
    const x = 5;
    t.text(x, y++, `Cash ${money(s.cash)}`, C.lime);
    if (s.debt) t.text(x, y++, `Owe Vinnie ${money(s.debt)}`, C.red);
    t.text(
      x,
      y++,
      `Best bankroll ${money(s.stats.peak)}   Biggest single win ${money(s.stats.biggestWin)}`,
      C.gray,
    );
    t.text(
      x,
      y++,
      `Hands played ${s.stats.hands}   Duels won ${s.stats.duelsWon}, lost ${s.stats.duelsLost}`,
      C.gray,
    );
    t.text(
      x,
      y++,
      `Players' Club points ${Math.floor(s.comps)}   Against Dutch: ${s.rival.wins} won, ${s.rival.losses} lost`,
      C.gray,
    );
    t.text(
      x,
      y++,
      `Tournaments played ${s.tourneyStats.played}, won ${s.tourneyStats.won}, prizes ${money(s.tourneyStats.prizes)}   Trophies ${s.trophies.length} of ${ALL_CASINOS.length}`,
      C.gray,
    );
    y++;
    t.text(x, y++, "SKILLS", C.yellow);
    for (const id of SKILL_ORDER) {
      const def = SKILLS[id];
      const base = s.skills[id];
      const eff = g.skill(id);
      t.text(x, y, def.name, C.light);
      t.text(
        x + 13,
        y,
        "■".repeat(eff) + "□".repeat(def.max - eff),
        eff > base ? C.cyan : C.yellow,
      );
      t.text(
        x + 18,
        y++,
        eff > 0 ? def.levels[eff - 1] : def.blurb,
        eff > 0 ? C.gray : C.dim,
        undefined,
        56,
      );
    }
    y++;
    t.text(x, y++, "POCKETS", C.yellow);
    if (!s.pockets.length) t.text(x, y++, "Empty.", C.dim);
    s.pockets.forEach((id, i) => {
      const it = ITEMS[id];
      const sel = i === this.cursor;
      t.text(x, y, `${sel ? "►" : " "} ${it.glyph} ${it.name}`, sel ? C.yellow : it.color);
      y++;
    });
    const sel = ITEMS[s.pockets[this.cursor]];
    if (sel) wrapLines(sel.text, 48).forEach((l) => t.text(x + 2, y++, l, C.cyan));

    // Progress along the Avenue.
    const px = 60;
    let py = 3;
    t.text(px, py++, "THE AVENUE", C.yellow);
    for (const id of CASINO_ORDER) {
      const c = CASINOS[id];
      const chip = s.chips.includes(id);
      const open = c.tier === 1 || s.chips.includes(CASINO_ORDER[c.tier - 2]);
      t.text(px, py, chip ? "●" : "○", chip ? c.theme.accent : C.dim);
      t.text(px + 2, py++, c.name, open ? c.theme.accent : C.dim);
      if (!open) {
        t.text(px + 4, py++, "Locked", C.dim);
        continue;
      }
      for (const r of [...c.rollers, c.boss]) {
        const done = g.beaten(r.id);
        t.text(
          px + 4,
          py,
          done ? "✓" : r.boss ? "★" : "·",
          done ? C.green : r.boss ? C.gold : C.gray,
        );
        t.text(px + 6, py, r.name, done ? C.gray : r.color, undefined, px + 34);
        t.text(px + 35, py++, money(r.stake), C.dim);
      }
      const heat = g.heatIn(id);
      if (heat)
        t.text(
          px + 4,
          py++,
          `Heat ${heat}${s.banned[id] ? " - banned" : ""}`,
          s.banned[id] ? C.red : C.orange,
        );
    }
    {
      const c = CASINOS.belle;
      const open = s.chips.includes(CASINO_ORDER[c.tier - 2]);
      const all = [...c.rollers, c.boss];
      const done = all.filter((r) => g.beaten(r.id)).length;
      py++;
      t.text(px, py, "⚓", open ? c.theme.accent : C.dim);
      t.text(px + 2, py, c.name, open ? c.theme.accent : C.dim);
      t.text(
        px + 24,
        py++,
        open
          ? `${done} of ${all.length} beaten${g.heatIn("belle") ? `, heat ${g.heatIn("belle")}` : ""}`
          : "at the pier - locked",
        done === all.length ? C.green : C.gray,
      );
    }
    t.text(5, ROWS - 3, "↑↓ look at pockets   Esc close", C.dim);
  }
}

export class LogScreen implements Screen {
  constructor(private app: App) {}

  key(e: KeyboardEvent): void {
    if (isBack(e) || isConfirm(e) || e.code === "KeyM") this.app.pop();
  }

  draw(t: Term): void {
    const g = this.app.game as Game;
    t.box(2, 1, COLS - 4, ROWS - 2, C.gray, "Message Log");
    const lines: { text: string; color: string }[] = [];
    for (const l of g.s.log)
      for (const w of wrapLines(l.text, COLS - 10)) lines.push({ text: w, color: l.color });
    lines.slice(-(ROWS - 6)).forEach((l, i) => t.text(5, 3 + i, l.text, l.color));
  }
}

/** The run is over: won, or busted. */
export class EndScreen implements Screen {
  readonly opaque = true;
  readonly music = "title" as const;

  constructor(
    private app: App,
    private result: "won" | "broke",
  ) {
    const g = app.game as Game;
    void addRecord(g, result);
    void app.forget();
    app.sound(result === "won" ? "jackpot" : "lose");
  }

  key(e: KeyboardEvent): void {
    if (isConfirm(e) || isBack(e)) {
      this.app.game = null;
      this.app.reset(new TitleScreen(this.app));
    }
  }

  draw(t: Term, now: number): void {
    const g = this.app.game as Game;
    const s = g.s;
    const won = this.result === "won";
    marquee(t, 2, now);
    marquee(t, ROWS - 4, now + 500);
    t.center(6, won ? "★  KING OF ACE AVENUE  ★" : "BUSTED", won ? C.gold : C.red);
    const lines = won
      ? [
          `${s.name} beat the Baron at the top of the Pinnacle.`,
          "Every casino on the Avenue pays you now.",
        ]
      : [`${s.name} is flat broke.`, "The bus out of town leaves at dawn. You'll be on it."];
    lines.forEach((l, i) => t.center(9 + i, l, C.white));
    const stats = [
      `Golden chips: ${s.chips.length} of 5`,
      `High rollers beaten: ${s.beaten.length}`,
      `Best bankroll: ${money(s.stats.peak)}`,
      `Biggest single win: ${money(s.stats.biggestWin)}`,
      `House hands played: ${s.stats.hands}`,
      `Turns: ${s.turn}`,
    ];
    stats.forEach((l, i) => t.center(13 + i, l, C.light));
    t.center(
      22,
      won ? "Your name goes up in the Hall of Fame." : "Your run is recorded in the Hall of Fame.",
      C.gray,
    );
    t.center(25, "Enter to return to the title screen", C.dim);
  }

  animating(): boolean {
    return true;
  }
}
