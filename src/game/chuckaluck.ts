/**
 * Chuck-a-luck, the riverboat dice game: three dice tumble in a wire birdcage. Bet on a number
 * (paid once for each die that shows it, ten to one if all three do), on High or Low (the total,
 * any triple loses), or on Any Triple.
 */
export type ChuckSpot = 1 | 2 | 3 | 4 | 5 | 6 | "high" | "low" | "triple";
export const CHUCK_SPOTS: ChuckSpot[] = [1, 2, 3, 4, 5, 6, "high", "low", "triple"];

/** A number showing on all three dice pays this many to one. */
export const NUMBER_TRIPLE_PAYS = 10;
export const ANY_TRIPLE_PAYS = 30;

export type ChuckBets = Partial<Record<string, number>>;

export const spotKey = (s: ChuckSpot): string => String(s);

export function spotLabel(s: ChuckSpot): string {
  if (s === "high") return "High 11-17";
  if (s === "low") return "Low 4-10";
  if (s === "triple") return "Any Triple";
  return `Number ${s}`;
}

export function spotHelp(s: ChuckSpot): string {
  if (s === "high") return "Pays 1:1 when the dice add up to 11 or more. Loses on any triple.";
  if (s === "low") return "Pays 1:1 when the dice add up to 10 or less. Loses on any triple.";
  if (s === "triple") return `Pays ${ANY_TRIPLE_PAYS}:1 when all three dice match.`;
  return `Pays 1:1 for each die showing ${s}, ${NUMBER_TRIPLE_PAYS}:1 if all three do.`;
}

/** What a bet hands back after a roll, stake included (0 when it loses). */
export function chuckReturn(spot: ChuckSpot, stake: number, dice: readonly number[]): number {
  const triple = dice[0] === dice[1] && dice[1] === dice[2];
  const sum = dice[0] + dice[1] + dice[2];
  if (spot === "triple") return triple ? stake * (ANY_TRIPLE_PAYS + 1) : 0;
  if (spot === "high") return !triple && sum >= 11 ? stake * 2 : 0;
  if (spot === "low") return !triple && sum <= 10 ? stake * 2 : 0;
  const hits = dice.filter((d) => d === spot).length;
  if (hits === 3) return stake * (NUMBER_TRIPLE_PAYS + 1);
  return hits ? stake * (hits + 1) : 0;
}

export function chuckTotal(bets: ChuckBets): number {
  return Object.values(bets).reduce<number>((s, v) => s + (v ?? 0), 0);
}
