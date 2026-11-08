import { C } from "../colors";

/** How a tournament player bets: small and steady, middling, or swinging for the fences. */
export type TStyle = "cautious" | "steady" | "wild";

/** Someone in a tournament seat. */
export interface Entrant {
  id: string;
  name: string;
  short: string;
  glyph: string;
  color: string;
  style: TStyle;
  /** Said after winning and losing a hand. */
  win: string[];
  lose: string[];
}

/** The tournament regulars: they turn up at every casino on the Avenue. */
export const REGULARS: Entrant[] = [
  {
    id: "pearl",
    name: "Granny Pearl",
    short: "Pearl",
    glyph: "G",
    color: C.pink,
    style: "cautious",
    win: ["Bingo!", "Pass the butterscotch, dear."],
    lose: ["Oh, fiddlesticks.", "My late husband would be furious."],
  },
  {
    id: "tex",
    name: "Tex Malone",
    short: "Tex",
    glyph: "T",
    color: C.tan,
    style: "wild",
    win: ["Yee-HAW!", "Let it ride, partner!"],
    lose: ["Dagnabbit.", "Ain't nothin' but a speed bump."],
  },
  {
    id: "nakamura",
    name: "Dr. Felix Nakamura",
    short: "Dr. N",
    glyph: "N",
    color: C.cyan,
    style: "steady",
    win: ["As calculated.", "Expected value, my friend."],
    lose: ["Variance.", "A statistically tolerable outcome."],
  },
  {
    id: "lucy",
    name: "Lucky Lucy Lark",
    short: "Lucy",
    glyph: "L",
    color: C.lime,
    style: "wild",
    win: ["Told you! Lucky!", "Wheee!"],
    lose: ["Luck's just resting.", "Pfft."],
  },
  {
    id: "quiet",
    name: "The Quiet Man",
    short: "Quiet",
    glyph: "Q",
    color: C.steel,
    style: "cautious",
    win: ["...", "*nods*"],
    lose: ["...", "*shrugs*"],
  },
  {
    id: "sal",
    name: "Big Sal Fontana",
    short: "Sal",
    glyph: "S",
    color: C.amber,
    style: "wild",
    win: ["Big Sal eats!", "Mangia!"],
    lose: ["Ehh, whaddya gonna do.", "Fuggedaboutit."],
  },
  {
    id: "mitzi",
    name: "Mitzi Glass",
    short: "Mitzi",
    glyph: "M",
    color: C.magenta,
    style: "steady",
    win: ["Darling, of course.", "Mwah!"],
    lose: ["How tedious.", "Ugh, this lighting."],
  },
  {
    id: "ike",
    name: "Ike Ferris",
    short: "Ike",
    glyph: "I",
    color: C.orange,
    style: "steady",
    win: ["Ferris wheel's going up!", "Nice."],
    lose: ["Round and round she goes.", "Hm."],
  },
];

/** Entry fee by casino tier. First place wins `PRIZES[0]` times the fee, second `PRIZES[1]`. */
export const TOURNEY_FEE = [50, 200, 750, 2500, 7500];
export const PRIZES = [3.5, 1.5];
export const TOURNEY_HANDS = 10;
export const TOURNEY_CHIPS = 1000;
export const TOURNEY_MIN = 10;
export const TOURNEY_MAX = 500;
