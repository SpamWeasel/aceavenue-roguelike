import { C } from "../colors";

/** Skills you learn at the Academy. Items and drinks can add to them, up to `max`. */
export type SkillId = "cards" | "read" | "face" | "wheel" | "slots" | "charm";
export const SKILL_ORDER: SkillId[] = ["cards", "read", "face", "wheel", "slots", "charm"];

export interface SkillDef {
  name: string;
  max: number;
  /** Lesson price for each level. */
  prices: number[];
  /** What each level does. */
  levels: string[];
  blurb: string;
}

export const SKILLS: Record<SkillId, SkillDef> = {
  cards: {
    name: "Card Sense",
    max: 3,
    prices: [150, 700, 3000],
    blurb: "Blackjack know-how, all the way up to counting cards.",
    levels: [
      "Shows what the book says to do with each blackjack hand.",
      "Keeps the running count of the shoe for you (Hi-Lo).",
      "Works out the true count and tells you when the shoe is hot.",
    ],
  },
  read: {
    name: "Poker Read",
    max: 3,
    prices: [200, 900, 4000],
    blurb: "Spotting tells across the poker table.",
    levels: [
      "Tells you what an opponent's habits usually mean.",
      "Your reads are right more often.",
      "Even good poker faces give a little away.",
    ],
  },
  face: {
    name: "Poker Face",
    max: 3,
    prices: [250, 1200, 5000],
    blurb: "Your own poker face. Opponents believe your bets.",
    levels: [
      "Opponents fold a little more often when you bet.",
      "Your bluffs work more often.",
      "Stone cold. Your bets look like the real thing.",
    ],
  },
  wheel: {
    name: "Wheel Watch",
    max: 2,
    prices: [400, 3500],
    blurb: "Reading roulette wheels for wear and lean.",
    levels: [
      "Shows the last 24 spins and which numbers come up most.",
      "Spots a worn wheel's favorite pockets at a glance.",
    ],
  },
  slots: {
    name: "Slot Sense",
    max: 2,
    prices: [100, 1500],
    blurb: "Telling a loose slot machine from a tight one.",
    levels: [
      "You get a feel for whether a machine is loose or tight.",
      "You can tell a machine's exact payback.",
    ],
  },
  charm: {
    name: "Charm",
    max: 3,
    prices: [200, 1000, 4500],
    blurb: "Friends in every casino.",
    levels: [
      "Heat builds 15% slower, drinks are cheaper, and gossip is more reliable.",
      "Heat builds 30% slower; bouncers let you back in sooner.",
      "Heat builds 45% slower. Everybody likes you.",
    ],
  },
};

export type ItemId =
  | "horseshoe"
  | "glasses"
  | "flask"
  | "watch"
  | "pendant"
  | "monocle"
  | "abacus"
  | "shades"
  | "cufflinks"
  | "rabbitfoot"
  | "clover"
  | "dollar"
  | "markeddeck"
  | "peekring";

export type ItemKind = "charm" | "lucky" | "cheat";

export interface ItemDef {
  id: ItemId;
  name: string;
  glyph: string;
  color: string;
  /** Full shop price. Pawn shops buy at half. */
  price: number;
  kind: ItemKind;
  text: string;
  /** Adds to a skill while you carry it. */
  skill?: [SkillId, number];
  /** Used up when it does its thing. */
  consumable?: boolean;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  horseshoe: {
    id: "horseshoe",
    name: "Lucky Horseshoe",
    glyph: "∩",
    color: C.steel,
    price: 400,
    kind: "charm",
    text: "Heat builds 25% slower while you carry it.",
  },
  glasses: {
    id: "glasses",
    name: "Opera Glasses",
    glyph: "∞",
    color: C.gold,
    price: 1800,
    kind: "charm",
    text: "+1 Poker Read.",
    skill: ["read", 1],
  },
  flask: {
    id: "flask",
    name: "Silver Hip Flask",
    glyph: "¡",
    color: C.steel,
    price: 350,
    kind: "charm",
    text: "Drinks last twice as long.",
  },
  watch: {
    id: "watch",
    name: "Diver's Watch",
    glyph: "ø",
    color: C.cyan,
    price: 600,
    kind: "charm",
    text: "Heat cools off twice as fast.",
  },
  pendant: {
    id: "pendant",
    name: "Crystal Pendant",
    glyph: "♦",
    color: C.purple,
    price: 1500,
    kind: "charm",
    text: "+1 Wheel Watch.",
    skill: ["wheel", 1],
  },
  monocle: {
    id: "monocle",
    name: "Jeweler's Monocle",
    glyph: "o",
    color: C.gold,
    price: 900,
    kind: "charm",
    text: "+1 Slot Sense.",
    skill: ["slots", 1],
  },
  abacus: {
    id: "abacus",
    name: "Pocket Abacus",
    glyph: "#",
    color: C.wood,
    price: 2500,
    kind: "charm",
    text: "+1 Card Sense.",
    skill: ["cards", 1],
  },
  shades: {
    id: "shades",
    name: "Mirrored Shades",
    glyph: "■",
    color: C.steel,
    price: 1200,
    kind: "charm",
    text: "+1 Poker Face.",
    skill: ["face", 1],
  },
  cufflinks: {
    id: "cufflinks",
    name: "Gold Cufflinks",
    glyph: "°",
    color: C.gold,
    price: 900,
    kind: "charm",
    text: "+1 Charm.",
    skill: ["charm", 1],
  },
  rabbitfoot: {
    id: "rabbitfoot",
    name: "Rabbit's Foot",
    glyph: "ƒ",
    color: C.tan,
    price: 60,
    kind: "lucky",
    consumable: true,
    text: "Slots: after a spin, nudge one reel up or down a stop.",
  },
  clover: {
    id: "clover",
    name: "Four-Leaf Clover",
    glyph: "♣",
    color: C.green,
    price: 150,
    kind: "lucky",
    consumable: true,
    text: "Blackjack: the first card that would bust you is burned instead.",
  },
  dollar: {
    id: "dollar",
    name: "Lucky Silver Dollar",
    glyph: "$",
    color: C.steel,
    price: 200,
    kind: "lucky",
    consumable: true,
    text: "Roulette or craps: your losing bets come back once.",
  },
  markeddeck: {
    id: "markeddeck",
    name: "Marked Deck",
    glyph: "▤",
    color: C.red,
    price: 800,
    kind: "cheat",
    consumable: true,
    text: "Poker duels: see the other hand for one deal. Get caught and you forfeit.",
  },
  peekring: {
    id: "peekring",
    name: "Peek Ring",
    glyph: "◦",
    color: C.amber,
    price: 1500,
    kind: "cheat",
    text: "House blackjack: glimpse the dealer's hole card. Raises heat every hand.",
  },
};

/** Chance a Marked Deck is spotted in a duel. */
export const MARKED_CAUGHT = 0.25;
/** Heat for each house blackjack hand played with the Peek Ring. */
export const PEEK_HEAT = 6;

export type DrinkId = "water" | "coffee" | "tea" | "soda" | "special";

export interface DrinkDef {
  name: string;
  /** Price at a first-tier casino; it goes up with the casino's tier. */
  price: number;
  text: string;
  /** Skill changes while the drink lasts. */
  skills?: Partial<Record<SkillId, number>>;
  /** Heat removed here at once. */
  cool?: number;
}

export const DRINK_ORDER: DrinkId[] = ["water", "coffee", "tea", "soda", "special"];
/** How many turns a drink lasts (doubled by the flask). */
export const DRINK_TURNS = 80;

export const DRINKS: Record<DrinkId, DrinkDef> = {
  water: { name: "Ice Water", price: 0, text: "On the house. Keeps you sharp, a little." },
  coffee: {
    name: "Black Coffee",
    price: 4,
    text: "+1 Card Sense for a while.",
    skills: { cards: 1 },
  },
  tea: { name: "Jasmine Tea", price: 4, text: "+1 Poker Read for a while.", skills: { read: 1 } },
  soda: {
    name: "Club Soda",
    price: 3,
    text: "Look like a tourist: heat here drops by 20.",
    cool: 20,
  },
  special: {
    name: "House Special",
    price: 8,
    text: "+1 Poker Face, but -1 Card Sense, for a while.",
    skills: { face: 1, cards: -1 },
  },
};
