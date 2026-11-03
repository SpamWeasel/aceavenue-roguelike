import { CASINO_ORDER, CASINOS } from "../../game/data/casinos";
import { DIFFICULTY, type Game } from "../../game/game";
import { readData, writeData } from "./storage";

/** Finished runs, best first. Kept beside the saves. */
export interface RunRecord {
  name: string;
  result: "won" | "broke";
  difficulty: string;
  /** The furthest casino reached. */
  reached: string;
  peak: number;
  chips: number;
  beaten: number;
  turns: number;
  date: string;
}

export async function loadRecords(): Promise<RunRecord[]> {
  try {
    const list = JSON.parse((await readData("records")) ?? "[]") as RunRecord[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function addRecord(game: Game, result: "won" | "broke"): Promise<void> {
  const list = await loadRecords();
  const s = game.s;
  list.push({
    name: s.name,
    result,
    difficulty: DIFFICULTY[s.difficulty].label,
    reached: CASINOS[CASINO_ORDER[Math.min(4, s.chips.length)]].name,
    peak: s.stats.peak,
    chips: s.chips.length,
    beaten: s.beaten.length,
    turns: s.turn,
    date: new Date().toISOString().slice(0, 10),
  });
  // Wins first (fastest first), then the rest by golden chips and best bankroll.
  list.sort((a, b) =>
    a.result === b.result
      ? a.result === "won"
        ? a.turns - b.turns
        : b.chips - a.chips || b.peak - a.peak
      : a.result === "won"
        ? -1
        : 1,
  );
  await writeData("records", JSON.stringify(list.slice(0, 50)));
}
