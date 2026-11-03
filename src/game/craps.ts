/**
 * Craps, cut down to the friendly bets: Pass and Don't Pass (with odds behind Pass), the Field
 * and Any Seven. You are always the shooter.
 */
export interface CrapsBets {
  pass: number;
  dontPass: number;
  /** Odds behind the Pass bet, only while a point is on. */
  odds: number;
  field: number;
  anySeven: number;
}

export type CrapsBetKind = keyof CrapsBets;

export const CRAPS_LABEL: Record<CrapsBetKind, string> = {
  pass: "Pass Line",
  dontPass: "Don't Pass",
  odds: "Pass Odds",
  field: "Field",
  anySeven: "Any Seven",
};

export const emptyBets = (): CrapsBets => ({
  pass: 0,
  dontPass: 0,
  odds: 0,
  field: 0,
  anySeven: 0,
});

/** Odds bets pay true odds: 2:1 on 4/10, 3:2 on 5/9, 6:5 on 6/8. */
export function oddsPayout(point: number, amount: number): number {
  if (point === 4 || point === 10) return amount * 2;
  if (point === 5 || point === 9) return Math.floor((amount * 3) / 2);
  return Math.floor((amount * 6) / 5);
}

/** Can this bet be placed or raised right now? */
export function canBet(kind: CrapsBetKind, point: number | null, bets: CrapsBets): boolean {
  if (kind === "pass" || kind === "dontPass") return point === null;
  if (kind === "odds") return point !== null && bets.pass > 0;
  return true;
}

/** Biggest odds bet allowed: twice the Pass bet. */
export const maxOdds = (bets: CrapsBets) => bets.pass * 2;

export interface CrapsResult {
  /** The point after this roll (null = next roll is a come-out roll). */
  point: number | null;
  /** Money handed back to the player (stakes plus winnings of settled bets). */
  returned: number;
  /** Bets still on the table after the roll. */
  bets: CrapsBets;
  /** Net result of each bet that was settled. */
  settled: { kind: CrapsBetKind; net: number }[];
  message: string;
}

/** Settles the bets for one roll of two dice. */
export function resolveRoll(
  dice: [number, number],
  point: number | null,
  bets: CrapsBets,
): CrapsResult {
  const total = dice[0] + dice[1];
  const left = { ...bets };
  const settled: CrapsResult["settled"] = [];
  let returned = 0;
  const win = (kind: CrapsBetKind, winnings: number) => {
    returned += left[kind] + winnings;
    settled.push({ kind, net: winnings });
    left[kind] = 0;
  };
  const lose = (kind: CrapsBetKind) => {
    settled.push({ kind, net: -left[kind] });
    left[kind] = 0;
  };
  const push = (kind: CrapsBetKind) => {
    returned += left[kind];
    settled.push({ kind, net: 0 });
    left[kind] = 0;
  };

  // One-roll bets.
  if (left.field) {
    if ([3, 4, 9, 10, 11].includes(total)) win("field", left.field);
    else if (total === 2 || total === 12) win("field", left.field * 2);
    else lose("field");
  }
  if (left.anySeven) {
    if (total === 7) win("anySeven", left.anySeven * 4);
    else lose("anySeven");
  }

  let next = point;
  let message: string;
  if (point === null) {
    if (total === 7 || total === 11) {
      message = `${total}! A natural - Pass wins.`;
      if (left.pass) win("pass", left.pass);
      if (left.dontPass) lose("dontPass");
    } else if (total === 2 || total === 3 || total === 12) {
      message =
        total === 12
          ? "Twelve, craps - Pass loses, Don't Pass pushes."
          : `Craps, ${total} - Pass loses.`;
      if (left.pass) lose("pass");
      if (left.dontPass) {
        if (total === 12) push("dontPass");
        else win("dontPass", left.dontPass);
      }
    } else {
      next = total;
      message = `The point is ${total}.`;
    }
  } else if (total === point) {
    message = `${total} - the point is made! Pass wins.`;
    if (left.pass) win("pass", left.pass);
    if (left.odds) win("odds", oddsPayout(point, left.odds));
    if (left.dontPass) lose("dontPass");
    next = null;
  } else if (total === 7) {
    message = "Seven out. Don't Pass wins.";
    if (left.pass) lose("pass");
    if (left.odds) lose("odds");
    if (left.dontPass) win("dontPass", left.dontPass);
    next = null;
  } else {
    message = `${total}. The point is still ${point}.`;
  }
  return { point: next, returned, bets: left, settled, message };
}

export const betTotal = (b: CrapsBets) => b.pass + b.dontPass + b.odds + b.field + b.anySeven;
