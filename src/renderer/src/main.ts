import { ROLLER_BY_ID } from "../../game/data/casinos";
import { Game } from "../../game/game";
import { App } from "./app";
import { BlackjackScreen } from "./screens/blackjack";
import { CrapsScreen } from "./screens/craps";
import { EndScreen, HelpScreen, SheetScreen, startGame, TitleScreen } from "./screens/menus";
import { PokerScreen } from "./screens/poker";
import { RouletteScreen } from "./screens/roulette";
import { ShopScreen } from "./screens/shop";
import { SlotsScreen } from "./screens/slots";
import { RollerScreen } from "./screens/talk";
import { loadSettings } from "./settings";
import { listSlots, readSlot, writeSlot } from "./storage";

const errors: string[] = [];
window.addEventListener("error", (e) => errors.push(String(e.message)));
window.addEventListener("unhandledrejection", (e) => errors.push(String(e.reason)));

void boot();

async function boot(): Promise<void> {
  await loadSettings();
  const canvas = document.getElementById("screen") as HTMLCanvasElement;
  const app = new App(canvas);
  app.reset(new TitleScreen(app));
  const smokeScene = window.aceavenue?.smokeScene;
  if (smokeScene) void smoke(app, smokeScene);
}

const press = (code: string, key = "") =>
  window.dispatchEvent(new KeyboardEvent("keydown", { code, key }));

/** Smoke tests (scripts/smoke.mjs): show one screen, then tell Electron to take a screenshot. */
async function smoke(app: App, scene: string): Promise<void> {
  const frames = (n: number) =>
    new Promise<void>((resolve) => {
      const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step));
      requestAnimationFrame(step);
    });
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
    original(...args);
  };
  await frames(10);
  try {
    if (scene === "saves") {
      // Two good saves, then a broken one: loading must fall back to the newest backup.
      const a = Game.create("First", "normal", 1).save();
      const b = Game.create("Second", "normal", 2).save();
      await writeSlot(1, "save A", a);
      await writeSlot(1, "save B", b);
      await writeSlot(1, "save C", "this is not a game");
      const got = await readSlot(1);
      if (!got?.recovered || got.data !== b)
        errors.push(`backup recovery failed: ${JSON.stringify(got)?.slice(0, 80)}`);
      const slots = await listSlots();
      if (!slots.find((s) => s.slot === 1)?.damaged) errors.push("damaged slot not flagged");
      Game.load(got?.data ?? "");
    } else if (scene === "create") {
      press("Enter");
      for (const k of "Lucky") press(`Key${k.toUpperCase()}`, k);
    } else if (scene === "settings") {
      for (const code of ["ArrowDown", "Enter"]) press(code);
    } else if (scene !== "title") {
      const g = Game.create("Smoke", "normal", 12345);
      const play = startGame(app, g, 2);
      const casino = (id: string) => {
        g.enterArea(id);
        g.s.y -= 2;
      };
      if (scene === "strip") {
        for (let i = 0; i < 6; i++) g.move(1, 0);
      } else if (scene === "floor") {
        casino("rustyspur");
      } else if (scene === "talk") {
        casino("rustyspur");
        app.push(new RollerScreen(app, play, ROLLER_BY_ID.jo));
      } else if (scene === "blackjack") {
        casino("rustyspur");
        g.s.skills.cards = 3;
        const table = g.area.tables.find((t) => t.kind === "blackjack");
        if (!table) throw new Error("no blackjack table");
        app.push(new BlackjackScreen(app, play, table));
        press("Enter");
      } else if (scene === "duel21") {
        casino("coralgrotto");
        g.s.chips.push("rustyspur");
        g.s.cash = 5000;
        const r = ROLLER_BY_ID.marlow;
        if (g.startDuel(r)) throw new Error("could not start a blackjack duel");
        app.push(new BlackjackScreen(app, play, null, r));
        press("Enter");
      } else if (scene === "poker") {
        casino("rustyspur");
        g.s.skills.read = 1;
        const r = ROLLER_BY_ID.jo;
        if (g.startDuel(r)) throw new Error("could not start a poker duel");
        app.push(new PokerScreen(app, play, r));
        press("Enter");
      } else if (scene === "roulette" || scene === "craps") {
        g.s.chips.push("rustyspur", "coralgrotto");
        g.s.cash = 3000;
        g.s.skills.wheel = 2;
        casino("starlight");
        const table = g.area.tables.find((t) => t.kind === scene);
        if (!table) throw new Error(`no ${scene} table`);
        if (scene === "roulette") {
          const h = g.spinHistory(table);
          for (let i = 0; i < 20; i++) h.push((i * 7) % 37);
          app.push(new RouletteScreen(app, play, table));
          for (const code of ["Enter", "ArrowDown", "ArrowDown", "ArrowDown", "Enter", "Enter"])
            press(code);
        } else {
          app.push(new CrapsScreen(app, play, table));
          for (const code of ["Enter", "Enter", "ArrowDown", "ArrowDown", "ArrowDown", "Enter"])
            press(code);
        }
      } else if (scene === "slots") {
        casino("rustyspur");
        g.s.skills.slots = 2;
        g.s.pockets.push("rabbitfoot");
        app.push(new SlotsScreen(app, play, g.area.machines[0]));
      } else if (scene === "shop") {
        g.s.cash = 2000;
        app.push(new ShopScreen(app, "academy"));
      } else if (scene === "sheet") {
        g.s.pockets.push("horseshoe", "clover", "shades");
        g.s.skills.cards = 2;
        g.s.beaten.push("pete", "jo");
        app.push(new SheetScreen(app));
      } else if (scene === "help") {
        app.push(new HelpScreen(app));
      } else if (scene === "ending") {
        g.s.over = "won";
        g.s.chips.push("rustyspur", "coralgrotto", "starlight", "velvetfox", "pinnacle");
        app.push(new EndScreen(app, "won"));
      }
      // A save written mid-game loads back.
      if (scene === "floor") Game.load(g.save());
    }
  } catch (err) {
    errors.push(String(err));
  }
  await frames(20);
  window.aceavenue?.signalReady({
    ok: errors.length === 0,
    scene,
    detail: errors.join("; ") || undefined,
  });
}
