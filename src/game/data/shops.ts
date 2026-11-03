import { C } from "../colors";
import type { ItemId } from "./items";

export type ShopId = "academy" | "charms" | "pawn" | "motel" | "loans";

export interface ShopDef {
  id: ShopId;
  name: string;
  owner: string;
  greet: string;
  color: string;
  wall: string;
}

export const SHOPS: Record<ShopId, ShopDef> = {
  academy: {
    id: "academy",
    name: "Professor Odds' Academy",
    owner: "Professor Odds",
    greet: "Knowledge is the only edge they can't take off you at the door. Well - mostly.",
    color: C.cyan,
    wall: "#16324a",
  },
  charms: {
    id: "charms",
    name: "Lady Luck Charms",
    owner: "Lady Luck",
    greet: "Lucky charms, honey! Every one guaranteed. Guarantee not guaranteed.",
    color: C.green,
    wall: "#16402a",
  },
  pawn: {
    id: "pawn",
    name: "Honest Abe's Pawn",
    owner: "Honest Abe",
    greet: "Buy, sell, trade. Honest prices. Mostly honest. Look, it's in the name.",
    color: C.amber,
    wall: "#4a3416",
  },
  motel: {
    id: "motel",
    name: "Sleepy Ace Motel",
    owner: "the night clerk",
    greet: "Ice machine's broke. Rooms are clean. Ish.",
    color: C.pink,
    wall: "#4a1a34",
  },
  loans: {
    id: "loans",
    name: "Vinnie's Easy Money",
    owner: "Vinnie",
    greet: "Need a little somethin' to tide you over? Vinnie's here for you. Vinnie's always here.",
    color: C.red,
    wall: "#3a1414",
  },
};

/** What Lady Luck sells, by how many golden chips you hold. */
export const CHARM_STOCK: ItemId[][] = [
  ["rabbitfoot", "clover", "horseshoe", "flask"],
  ["dollar", "watch", "monocle", "cufflinks"],
  ["shades", "pendant", "glasses"],
  ["abacus"],
];

/** Pawn shops sell at this share of the full price and buy at `PAWN_BUYS`. */
export const PAWN_SELLS = 0.7;
export const PAWN_BUYS = 0.5;
export const PAWN_STOCK = 3;

/** A room for the night costs this times the best casino tier you've reached. */
export const MOTEL_PRICE = 20;

/** Vinnie lends this times the casino tier you've reached, paid back with interest. */
export const LOAN_SIZE = 400;
export const LOAN_INTEREST = 0.5;
/** Turns until a loan is due; after that his collector takes what you owe. */
export const LOAN_TERM = 500;

/** Things people on the Avenue say. */
export const STREET_LINES = [
  "Every casino on the Avenue pays the Baron. Every single one.",
  "The Academy taught me to count cards. Then the Spur taught me to count my losses.",
  "Lady Luck's charms work, kid. I've got eleven. ...I've got eleven charms and no money.",
  "Honest Abe once sold me my own watch. Twice.",
  "Don't borrow from Vinnie. If you do borrow from Vinnie, pay Vinnie.",
  "Beat the boss of a casino and you get its golden chip. The next doorman wants to see it.",
  "Win too much and security walks you out. Take a night at the motel and they forget your face.",
  "The Pinnacle? You need a whole lotta money just to sit down up there.",
  "Slot machines aren't all the same. Some are loose, some are tight. Nobody tells you which.",
  "My cousin swears an old roulette wheel will tell you its favorite numbers if you watch.",
  "Never take insurance. Unless you're counting. Then sometimes take insurance.",
  "Blackjack that pays 6:5? That's not blackjack, that's a mugging.",
];

/** Things casino patrons say when they have no gossip. */
export const PATRON_LINES = [
  "I'm due. I can feel it. I've been due for three days.",
  "Never split tens, kid. Never.",
  "The pit boss hates big jumps in your bets. Keep 'em steady when he's looking.",
  "Free drinks! Well, the water's free.",
  "I won a hundred bucks an hour ago. I'm down four hundred since. Still up on the day, though!",
  "Craps tables are loud, but the Pass Line odds are the fairest bet in the house.",
  "Those 6:5 blackjack tables are a rip-off. Look for 3:2.",
  "Dealer hits soft seventeen at some tables. That's worse for you, I hear.",
  "If you're on a cold streak, walk away. That's what my wife says. She's at the slots.",
  "Seen any high rollers? They're the ones with the private tables and the big stacks.",
  "The VIP room only opens for folks who've beaten every high roller on the floor.",
];

export const PIT_BOSS_LINES: [number, string][] = [
  [0, "Welcome. Enjoy yourself. Not too much."],
  [30, "I've had my eye on you, friend. Keep it friendly."],
  [60, "You're having a very lucky night. I don't like lucky nights."],
  [85, "One more stunt and you're out the door. Understand?"],
];

export const SECURITY_LINES = [
  "Keep it moving.",
  "No cameras. No funny business.",
  "Enjoy your evening, sir or madam.",
  "I've thrown out bigger than you, kid.",
];

export const WAITRESS_LINES = ["Drinks? Anything to drink?", "Something to sip on, hon?"];
