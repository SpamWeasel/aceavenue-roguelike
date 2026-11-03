import type { BjRules } from "../blackjack";
import { C } from "../colors";
import type { PokerPersona, TellKind } from "../poker";
import type { ItemId } from "./items";

export type HouseGame = "blackjack" | "slots" | "roulette" | "craps";
export type CasinoId = "rustyspur" | "coralgrotto" | "starlight" | "velvetfox" | "pinnacle";
export const CASINO_ORDER: CasinoId[] = [
  "rustyspur",
  "coralgrotto",
  "starlight",
  "velvetfox",
  "pinnacle",
];

/** Parts of a portrait (see screens/portrait.ts). */
export type HatKind =
  | "cowboy"
  | "tophat"
  | "captain"
  | "fedora"
  | "beret"
  | "hair"
  | "longhair"
  | "bun"
  | "bald"
  | "helmet"
  | "crown"
  | "feather"
  | "pompadour";
export type BodyKind = "vest" | "suit" | "tie" | "dress" | "uniform" | "jacket" | "coat";

export interface Look {
  hat: HatKind;
  /** Three characters, e.g. "o o", "■-■". */
  eyes: string;
  mouth: string;
  chin: "plain" | "beard" | "stache";
  body: BodyKind;
  hatColor: string;
  skin: string;
  clothes: string;
}

export interface RollerDef {
  id: string;
  name: string;
  /** Shorter name for tight spots. */
  short: string;
  title: string;
  glyph: string;
  color: string;
  game: "poker" | "blackjack";
  stake: number;
  persona?: PokerPersona;
  rules?: BjRules;
  look: Look;
  /** Given to you when you clean them out. */
  reward?: ItemId;
  boss?: boolean;
  greet: string;
  chat: string[];
  /** Said when you sit down. */
  challenge: string;
  winHand: string[];
  loseHand: string[];
  /** Said when you clean them out. */
  beaten: string;
  /** Said when they clean you out. */
  victory: string;
  /** Said when you talk to them after beating them. */
  after: string;
  /** Poker only: what they do with strong, weak and so-so hands. */
  tells?: Record<TellKind, string[]>;
  /** Gossip that gives away their weak tell. */
  tellTip?: string;
}

export interface CasinoTheme {
  wall: string;
  wallFg: string;
  carpet: [string, string];
  carpetFg: string;
  felt: string;
  accent: string;
  sign: string;
}

export interface CasinoDef {
  id: CasinoId;
  name: string;
  tier: number;
  blurb: string;
  theme: CasinoTheme;
  games: HouseGame[];
  bj: { min: number; max: number; rules: BjRules[] };
  roulette?: { min: number; max: number; doubleZero: boolean };
  craps?: { min: number; max: number };
  slotCoin: number;
  /** Chance each slot machine is loose. */
  looseChance: number;
  /** Chance each roulette wheel is worn. */
  biasChance: number;
  rollers: RollerDef[];
  boss: RollerDef;
  welcome: string;
}

const shoe6: BjRules = { decks: 6, h17: false, bjPays: 1.5, das: true };
const shoe6h: BjRules = { decks: 6, h17: true, bjPays: 1.5, das: true };
const sixFive: BjRules = { decks: 6, h17: true, bjPays: 1.2, das: false };
const double2: BjRules = { decks: 2, h17: false, bjPays: 1.5, das: true };

export const CASINOS: Record<CasinoId, CasinoDef> = {
  rustyspur: {
    id: "rustyspur",
    name: "The Rusty Spur",
    tier: 1,
    blurb: "A dusty old saloon with swinging doors and cheap tables.",
    welcome: "Sawdust on the floor, a player piano in the corner. Howdy, stranger.",
    theme: {
      wall: C.darkWood,
      wallFg: C.wood,
      carpet: ["#2b1a10", "#33200f"],
      carpetFg: "#4a3020",
      felt: C.felt,
      accent: C.amber,
      sign: C.orange,
    },
    games: ["blackjack", "slots"],
    bj: { min: 5, max: 100, rules: [shoe6h, shoe6h, sixFive] },
    slotCoin: 1,
    looseChance: 0.15,
    biasChance: 0,
    rollers: [
      {
        id: "pete",
        name: "Dusty Pete",
        short: "Pete",
        title: "the old cattle drover",
        glyph: "P",
        color: C.tan,
        game: "blackjack",
        stake: 200,
        rules: { decks: 1, h17: true, bjPays: 1.5, das: false },
        look: {
          hat: "cowboy",
          eyes: "- -",
          mouth: "~",
          chin: "beard",
          body: "vest",
          hatColor: C.brown,
          skin: C.tan,
          clothes: C.wood,
        },
        reward: "horseshoe",
        greet: "Well howdy, young'un. Ain't many folks your age in a place like this.",
        chat: [
          "I drove cattle forty years. Dealin' cards is easier on the knees.",
          "Rumor is the Colonel won this whole saloon in a single hand of draw.",
          "One deck, kid. Folks who can keep track of the cards do all right against me.",
        ],
        challenge: "Pull up a stool. I'll deal; you try not to bust.",
        winHand: ["Heh. The house abides.", "Twenty-one's a long way off, ain't it?"],
        loseHand: ["Well, shoot.", "Beginner's luck, I reckon."],
        beaten: "Cleaned out by a kid! Here - take my old horseshoe. Luck's done with me anyhow.",
        victory: "Don't take it hard. Come back when your pockets are heavier.",
        after: "That horseshoe treatin' you right?",
      },
      {
        id: "jo",
        name: "Calamity Jo",
        short: "Jo",
        title: "the trick-shot showgirl",
        glyph: "J",
        color: C.pink,
        game: "poker",
        stake: 300,
        persona: { tight: 0.2, aggro: 0.65, bluff: 0.45, face: 0.2 },
        look: {
          hat: "feather",
          eyes: "^ ^",
          mouth: "▽",
          chin: "plain",
          body: "dress",
          hatColor: C.red,
          skin: C.paper,
          clothes: C.magenta,
        },
        reward: "glasses",
        greet:
          "Well aren't you a sight! Ever played draw with a lady who can shoot a coin at forty paces?",
        chat: [
          "I did six shows a night at the Spur till my wrist gave out. Now I just shoot the moon.",
          "Hank thinks two hats make him twice as lucky. I think they make him twice as tall.",
        ],
        challenge: "Five-card draw, sugar. Ante up!",
        winHand: ["Bang! Right through the middle.", "Ha! Never bet against a sharpshooter."],
        loseHand: ["Oh, you rascal.", "Fine, fine. Lucky shot."],
        beaten: "Out of ammo! Here, take my opera glasses. You'll spot a bluff a mile off.",
        victory: "That's showbiz, sugar. Come back for the matinee.",
        after: "You still owe me a rematch, sharpshooter.",
        tells: {
          strong: ["spins a chip across her knuckles", "flashes a big showgirl smile"],
          weak: ["whistles a little tune", "fans herself with her cards"],
          neutral: ["adjusts her feathered hat", "taps her boot on the rail"],
        },
        tellTip: "Calamity Jo whistles when she's got nothing. Every single time.",
      },
      {
        id: "hank",
        name: 'Hank "Two Hats" Bodine',
        short: "Hank",
        title: "the stagecoach heir",
        glyph: "H",
        color: C.amber,
        game: "poker",
        stake: 400,
        persona: { tight: 0.45, aggro: 0.3, bluff: 0.15, face: 0.4 },
        look: {
          hat: "tophat",
          eyes: "o o",
          mouth: "─",
          chin: "stache",
          body: "suit",
          hatColor: C.brown,
          skin: C.tan,
          clothes: C.darkWood,
        },
        reward: "flask",
        greet: "Name's Bodine. Hank Bodine. Yes, both hats. One for luck and one for spare luck.",
        chat: [
          "My granddaddy ran the stagecoach line out here. I inherited the hats and the debts.",
          "I only bet when I've got the goods. Patience, partner. Patience.",
        ],
        challenge: "Sit yourself down. I don't play fast, but I play right.",
        winHand: ["Patience pays.", "Told you I play right."],
        loseHand: ["Hm. Spare luck didn't kick in.", "Well, that'll happen."],
        beaten: "Both hats empty. Take my flask, partner - you've earned a nip.",
        victory: "Slow and steady, partner. Slow and steady.",
        after: "Two hats, no money. Tell nobody.",
        tells: {
          strong: ["swaps one hat for the other", "pats both hats like they're lucky"],
          weak: ["chews his toothpick hard", "stares up at the ceiling fan"],
          neutral: ["shuffles his chips", "hums an old trail song"],
        },
        tellTip: "Hank chews that toothpick to splinters when his cards are no good.",
      },
    ],
    boss: {
      id: "colonel",
      name: "Colonel Buckley Hardigan",
      short: "the Colonel",
      title: "owner of the Rusty Spur",
      glyph: "C",
      color: C.red,
      game: "poker",
      stake: 800,
      boss: true,
      persona: { tight: 0.5, aggro: 0.55, bluff: 0.25, face: 0.6 },
      look: {
        hat: "cowboy",
        eyes: "o o",
        mouth: "═",
        chin: "stache",
        body: "tie",
        hatColor: C.white,
        skin: C.pink,
        clothes: C.white,
      },
      greet: "So you're the youngster cleaning out my regulars. Have a seat in my parlor.",
      chat: [
        "I won this saloon on a pair of nines. Never needed better.",
        "Beat me and you'll get the Spur's golden chip. The doorman at the Coral Grotto honors it.",
      ],
      challenge: "Draw poker, the gentleman's game. My house, my deal.",
      winHand: ["The house thanks you.", "Experience, son. Experience."],
      loseHand: ["Hmph.", "A fair pot, fairly won."],
      beaten:
        "Well I'll be. The Rusty Spur's golden chip is yours, and the Coral Grotto will let you in.",
      victory: "Come back when you've got some whiskers on you.",
      after: "Give my regards to the Admiral at the Grotto. Old windbag.",
      tells: {
        strong: ["twirls his mustache slowly", "leans back and lights a cigar"],
        weak: ["drums his fingers on the felt", "clears his throat twice"],
        neutral: ["sips his sarsaparilla", "straightens his string tie"],
      },
      tellTip: "The Colonel drums his fingers when he's in trouble. Hard to spot, though.",
    },
  },

  coralgrotto: {
    id: "coralgrotto",
    name: "The Coral Grotto",
    tier: 2,
    blurb: "An undersea palace of glass tanks, pearls and blue light.",
    welcome: "Fish drift past the glass walls. The air smells of salt and money.",
    theme: {
      wall: C.deepSea,
      wallFg: C.teal,
      carpet: ["#0b2236", "#0d2a40"],
      carpetFg: "#1d4a66",
      felt: "#0f5a5a",
      accent: C.cyan,
      sign: C.cyan,
    },
    games: ["blackjack", "slots", "roulette"],
    bj: { min: 25, max: 500, rules: [shoe6, shoe6h, sixFive] },
    roulette: { min: 5, max: 500, doubleZero: false },
    slotCoin: 5,
    looseChance: 0.14,
    biasChance: 0.4,
    rollers: [
      {
        id: "marlow",
        name: "Captain Ines Marlow",
        short: "Marlow",
        title: "the salvage diver",
        glyph: "M",
        color: C.cyan,
        game: "blackjack",
        stake: 1000,
        rules: double2,
        look: {
          hat: "captain",
          eyes: "o o",
          mouth: "‿",
          chin: "plain",
          body: "coat",
          hatColor: C.navy,
          skin: C.tan,
          clothes: C.navy,
        },
        reward: "watch",
        greet:
          "Ahoy. I pull gold off the sea floor for a living. Pulling it off you should be easier.",
        chat: [
          "Two decks in my shoe. The tide turns fast with two decks - watch it.",
          "Madame Nerissa read my fortune once. Said I'd lose to a kid. Hmph.",
        ],
        challenge: "Grab a chair. I deal, you dive.",
        winHand: ["Sunk you.", "Down to the depths."],
        loseHand: ["Choppy water.", "Hm. You surfaced."],
        beaten: "Wrecked! Take my diver's watch - it'll help you keep your head cool.",
        victory: "Lost at sea. Come back with better charts.",
        after: "Keep that watch dry, sailor.",
      },
      {
        id: "lou",
        name: '"Lucky" Lou Finnegan',
        short: "Lou",
        title: "the dockside bookie",
        glyph: "L",
        color: C.green,
        game: "poker",
        stake: 1500,
        persona: { tight: 0.15, aggro: 0.3, bluff: 0.15, face: 0.3 },
        look: {
          hat: "fedora",
          eyes: "o o",
          mouth: "o",
          chin: "plain",
          body: "jacket",
          hatColor: C.darkGreen,
          skin: C.pink,
          clothes: C.green,
        },
        reward: "dollar",
        greet: "Lou Finnegan, licensed and bonded. Well, bonded. What're the odds you'll beat me?",
        chat: [
          "I'll call anything, pal. Can't win it if you ain't in it!",
          "I got a guy who says the wheel by the fish tank loves certain numbers. Can't prove it.",
        ],
        challenge: "Let's play some cards! I'll give you even money.",
        winHand: ["Paid in full!", "Lucky Lou strikes again."],
        loseHand: ["Ah, a bad beat.", "Whaddya gonna do."],
        beaten: "Tapped out. Here, take my lucky silver dollar. Didn't do much for me.",
        victory: "The book always balances, pal.",
        after: "Wanna bet on who wins the next hand at the Spur? No? Suit yourself.",
        tells: {
          strong: ["licks his pencil and scribbles", "loosens his collar, grinning"],
          weak: ["mutters about bad beats", "checks his betting slips"],
          neutral: ["chomps his gum", "flips his pencil"],
        },
        tellTip: "Lou mutters about bad beats when his hand's a dud.",
      },
      {
        id: "nerissa",
        name: "Madame Nerissa",
        short: "Nerissa",
        title: "fortune teller of the tides",
        glyph: "N",
        color: C.purple,
        game: "poker",
        stake: 2000,
        persona: { tight: 0.4, aggro: 0.5, bluff: 0.35, face: 0.7 },
        look: {
          hat: "longhair",
          eyes: "◦ ◦",
          mouth: "‿",
          chin: "plain",
          body: "dress",
          hatColor: C.violet,
          skin: C.tan,
          clothes: C.purple,
        },
        reward: "pendant",
        greet: "I saw you coming, child. The cards whispered your name... or was it the waiter?",
        chat: [
          "The roulette wheels here are old. Old wheels have favorite numbers. Listen to them.",
          "The Admiral is a stubborn man. Stubborn men stand on hands they should hit.",
        ],
        challenge: "Sit. Let us see what the cards foretell.",
        winHand: ["As foretold.", "The tide favors me."],
        loseHand: ["The spirits are restless.", "Hm. Unforeseen."],
        beaten: "The cards spoke truly. Take my crystal - it will show you the wheel's secrets.",
        victory: "Your future holds... a trip to the cash machine.",
        after: "Your aura is very green, child. Like money.",
        tells: {
          strong: ["hums softly to her crystal", "smiles like she's seen the future"],
          weak: ["jingles her bracelets", "traces circles on the felt"],
          neutral: ["gazes into the aquarium", "rearranges her rings"],
        },
        tellTip: "Nerissa jingles those bracelets when the spirits fail her.",
      },
    ],
    boss: {
      id: "wren",
      name: "Admiral Thaddeus Wren",
      short: "the Admiral",
      title: "master of the Coral Grotto",
      glyph: "W",
      color: C.white,
      game: "blackjack",
      stake: 4000,
      boss: true,
      rules: { decks: 1, h17: true, bjPays: 1.5, das: false },
      look: {
        hat: "captain",
        eyes: "o o",
        mouth: "─",
        chin: "beard",
        body: "uniform",
        hatColor: C.white,
        skin: C.pink,
        clothes: C.navy,
      },
      greet: "Permission to come aboard granted. Briefly.",
      chat: [
        "One deck, dealer hits soft seventeen. A captain's game.",
        "My golden chip opens the Starlight Lounge. Earn it.",
      ],
      challenge: "Blackjack. I deal. Battle stations!",
      winHand: ["Direct hit.", "Steady as she goes."],
      loseHand: ["Blast.", "A glancing blow."],
      beaten: "I strike my colors. The Grotto's golden chip is yours - the Starlight awaits.",
      victory: "Dismissed.",
      after: "The Starlight crowd is all flash. Mind your wallet.",
    },
  },

  starlight: {
    id: "starlight",
    name: "The Starlight Lounge",
    tier: 3,
    blurb: "Space-age chrome, rocket fins and a ceiling full of stars.",
    welcome: "A ceiling of painted stars turns slowly overhead. A robot butler waves.",
    theme: {
      wall: C.violet,
      wallFg: C.magenta,
      carpet: ["#160c2a", "#1c1036"],
      carpetFg: "#3a2a66",
      felt: "#2a1f6b",
      accent: C.magenta,
      sign: C.magenta,
    },
    games: ["blackjack", "slots", "roulette", "craps"],
    bj: { min: 50, max: 1000, rules: [shoe6h, { ...shoe6h, decks: 8 }, sixFive] },
    roulette: { min: 25, max: 1000, doubleZero: true },
    craps: { min: 25, max: 1000 },
    slotCoin: 25,
    looseChance: 0.13,
    biasChance: 0.35,
    rollers: [
      {
        id: "oscar",
        name: "Orbit Oscar",
        short: "Oscar",
        title: "the lounge crooner",
        glyph: "O",
        color: C.gold,
        game: "blackjack",
        stake: 5000,
        rules: { decks: 8, h17: true, bjPays: 2, das: false },
        look: {
          hat: "pompadour",
          eyes: "■-■",
          mouth: "▽",
          chin: "plain",
          body: "suit",
          hatColor: C.black,
          skin: C.tan,
          clothes: C.gold,
        },
        reward: "cufflinks",
        greet: "Hey there, star child! Fly me to the felt, baby, and let me deal you in.",
        chat: [
          "At my table blackjack pays two to one, baby! I'm a generous cat.",
          "Dr. Quasar says my rules cost me money. I say they cost me nothing but style.",
        ],
        challenge: "Swingin'! Let's make some music.",
        winHand: ["Doo-be-doo-be-doo!", "That's the way the cookie crumbles."],
        loseHand: ["Ooh, a sour note.", "Cool, cool. Real cool."],
        beaten: "The show's over, baby. Take my gold cufflinks. Folks'll love you.",
        victory: "And that's the last song of the set!",
        after: "You got style, star child. Real style.",
      },
      {
        id: "nova",
        name: "Nova Belle",
        short: "Nova",
        title: "the rocket-race champion",
        glyph: "B",
        color: C.orange,
        game: "poker",
        stake: 6000,
        persona: { tight: 0.25, aggro: 0.85, bluff: 0.5, face: 0.3 },
        look: {
          hat: "helmet",
          eyes: "o o",
          mouth: "▽",
          chin: "plain",
          body: "jacket",
          hatColor: C.orange,
          skin: C.paper,
          clothes: C.red,
        },
        reward: "shades",
        greet: "Nova Belle, three-time Moon Run champion. I don't do slow. Ready for liftoff?",
        chat: [
          "Full throttle, all the time. Raise, raise, raise!",
          "The Commander upstairs thinks I'm reckless. She's right. I'm also rich.",
        ],
        challenge: "Strap in!",
        winHand: ["Liftoff!", "Eat my exhaust!"],
        loseHand: ["Engine trouble.", "Pfft. Lucky."],
        beaten: "Crash and burn! Here - my racing shades. Nobody'll see you sweat.",
        victory: "Too fast for you, groundhog.",
        after: "Next time I'm going twice as fast.",
        tells: {
          strong: ["counts down under her breath", "zips her flight jacket up"],
          weak: ["bounces her knee", "glances at the exit"],
          neutral: ["polishes her goggles", "taps her helmet"],
        },
        tellTip: "Nova bounces her knee when she's bluffing. Can't sit still.",
      },
      {
        id: "quasar",
        name: "Dr. Quentin Quasar",
        short: "Quasar",
        title: "professor of probability",
        glyph: "Q",
        color: C.teal,
        game: "poker",
        stake: 8000,
        persona: { tight: 0.5, aggro: 0.5, bluff: 0.3, face: 0.85 },
        look: {
          hat: "bald",
          eyes: "◘ ◘",
          mouth: "─",
          chin: "beard",
          body: "tie",
          hatColor: C.tan,
          skin: C.tan,
          clothes: C.teal,
        },
        reward: "abacus",
        greet: "Ah, a new variable. Shall we test your expected value?",
        chat: [
          "Every bet in this building loses, on average. Except the ones made by people who count.",
          "Card counting is not cheating. It is arithmetic. The casinos merely dislike arithmetic.",
        ],
        challenge: "A statistically significant sample, then.",
        winHand: ["As the numbers predicted.", "Regression to the mean."],
        loseHand: ["An outlier.", "Noise. Merely noise."],
        beaten: "Fascinating. Take my pocket abacus - you clearly know how to use it.",
        victory: "Q.E.D.",
        after: "I am rewriting my paper on you.",
        tells: {
          strong: ["scribbles an equation", "adjusts his bow tie"],
          weak: ["cleans his spectacles", "sighs at the decimal places"],
          neutral: ["consults a slide rule", "murmurs about variance"],
        },
        tellTip: "The professor cleans his spectacles when the math's against him.",
      },
    ],
    boss: {
      id: "vega",
      name: "Commander Vega Stroud",
      short: "the Commander",
      title: "captain of the Starlight",
      glyph: "V",
      color: C.magenta,
      game: "poker",
      stake: 15000,
      boss: true,
      persona: { tight: 0.55, aggro: 0.65, bluff: 0.3, face: 0.7 },
      look: {
        hat: "bun",
        eyes: "o o",
        mouth: "─",
        chin: "plain",
        body: "uniform",
        hatColor: C.white,
        skin: C.tan,
        clothes: C.magenta,
      },
      greet: "Commander Stroud. You're cleared for the bridge. Don't touch anything.",
      chat: [
        "I ran the Starlight before it had a roof. Before it had a floor.",
        "Win my golden chip and the Velvet Fox will open its door to you.",
      ],
      challenge: "Five-card draw. Countdown begins now.",
      winHand: ["Mission accomplished.", "Course correction: your wallet."],
      loseHand: ["A minor malfunction.", "Noted."],
      beaten: "Abort, abort. You've earned the Starlight's golden chip. The Velvet Fox awaits.",
      victory: "Splashdown. Better luck next launch.",
      after: "The Velvet Fox plays for keeps. Godspeed.",
      tells: {
        strong: ["salutes the deck", "checks her chronometer"],
        weak: ["clicks her pen", "gazes up at the stars"],
        neutral: ["straightens her epaulets", "orders another moon-juice"],
      },
      tellTip: "The Commander clicks her pen when a hand's going nowhere.",
    },
  },

  velvetfox: {
    id: "velvetfox",
    name: "The Velvet Fox",
    tier: 4,
    blurb: "An art-deco speakeasy behind a door with no handle.",
    welcome: "A jazz trio plays low. Everyone here is dressed better than you.",
    theme: {
      wall: "#1a1408",
      wallFg: C.gold,
      carpet: ["#1a0a10", "#220c14"],
      carpetFg: "#4a2030",
      felt: "#5a1426",
      accent: C.gold,
      sign: C.gold,
    },
    games: ["blackjack", "slots", "roulette", "craps"],
    bj: { min: 100, max: 2500, rules: [shoe6, double2, sixFive] },
    roulette: { min: 50, max: 2500, doubleZero: false },
    craps: { min: 50, max: 2500 },
    slotCoin: 50,
    looseChance: 0.12,
    biasChance: 0.3,
    rollers: [
      {
        id: "vivian",
        name: "Vivian Ash",
        short: "Vivian",
        title: "the jazz singer",
        glyph: "A",
        color: C.pink,
        game: "blackjack",
        stake: 15000,
        rules: { decks: 1, h17: true, bjPays: 1.5, das: true },
        look: {
          hat: "longhair",
          eyes: "- -",
          mouth: "‿",
          chin: "plain",
          body: "dress",
          hatColor: C.black,
          skin: C.tan,
          clothes: C.red,
        },
        reward: "monocle",
        greet: "Well, hello, darling. I sing at ten. Until then, I deal.",
        chat: [
          "One deck at my table, darling. Keep your mind on the cards, not on me.",
          "Mr. Fontaine checks his watch when he's nervous. You didn't hear it from me.",
        ],
        challenge: "Let's make it a duet.",
        winHand: ["Mmm, sweet music.", "That's my song."],
        loseHand: ["A blue note.", "Oh, you devil."],
        beaten:
          "Encore, darling. Take my monocle - it's for appraising jewels, but slots work too.",
        victory: "And scene. Goodnight, darling.",
        after: "Come hear me sing sometime. On the house.",
      },
      {
        id: "fontaine",
        name: "Mr. Fontaine",
        short: "Fontaine",
        title: "the bootlegger",
        glyph: "F",
        color: C.amber,
        game: "poker",
        stake: 20000,
        persona: { tight: 0.5, aggro: 0.45, bluff: 0.22, face: 0.6 },
        look: {
          hat: "fedora",
          eyes: "o o",
          mouth: "═",
          chin: "stache",
          body: "suit",
          hatColor: C.dim,
          skin: C.pink,
          clothes: C.dim,
        },
        reward: "markeddeck",
        greet: "You're the kid. I heard. Siddown, keep your hands where I can see 'em.",
        chat: [
          "I supply the bubbly in this joint. Officially, it's ginger ale.",
          "The Twins never stop whispering. Drives me nuts.",
        ],
        challenge: "Cards. Now. I got a shipment at midnight.",
        winHand: ["Business is business.", "Thanks for the donation."],
        loseHand: ["Heh. Not bad, kid.", "Don't get used to it."],
        beaten: "Kid's got moxie. Here - a deck from my private stock. Use it careful.",
        victory: "Scram, kid.",
        after: "You didn't see me. I wasn't here.",
        tells: {
          strong: ["taps the ash off his cigar", "orders a round for the table"],
          weak: ["checks his pocket watch", "glances at the door"],
          neutral: ["straightens his cufflinks", "smooths his pinstripes"],
        },
        tellTip: "Fontaine checks his pocket watch when he's holding garbage.",
      },
      {
        id: "twins",
        name: "The Delacroix Twins",
        short: "the Twins",
        title: "two minds, one bankroll",
        glyph: "T",
        color: C.lime,
        game: "poker",
        stake: 25000,
        persona: { tight: 0.35, aggro: 0.6, bluff: 0.45, face: 0.55 },
        look: {
          hat: "hair",
          eyes: "o o",
          mouth: "‿",
          chin: "plain",
          body: "tie",
          hatColor: C.brown,
          skin: C.paper,
          clothes: C.darkGreen,
        },
        reward: "peekring",
        greet: '"We are Delacroix." "And Delacroix." "We play as one." "Mostly."',
        chat: [
          '"Our father ran cards on the riverboats." "Our mother ran the riverboats."',
          '"Madame Royale owns this place." "She owns everything." "Even the walls listen."',
        ],
        challenge: '"Deal us in." "Both of us."',
        winHand: ['"Ha!" "Ha!"', '"Our pot." "Ours."'],
        loseHand: ['"Your fault." "No, yours."', '"Hm." "Hm."'],
        beaten: '"We lose." "We never lose." "Take the ring, then." "It sees things."',
        victory: '"Goodbye!" "Goodbye!"',
        after: '"We are still arguing about it." "We are not."',
        tells: {
          strong: ["finish each other's sentences", "clink their glasses together"],
          weak: ["whisper to each other", "both reach for the same chip"],
          neutral: ["swap seats", "flip a coin between them"],
        },
        tellTip: "When the Delacroix Twins start whispering, they're scared of their cards.",
      },
    ],
    boss: {
      id: "royale",
      name: "Madame Royale",
      short: "Madame Royale",
      title: "proprietress of the Velvet Fox",
      glyph: "R",
      color: C.red,
      game: "blackjack",
      stake: 40000,
      boss: true,
      rules: double2,
      look: {
        hat: "crown",
        eyes: "◦ ◦",
        mouth: "▽",
        chin: "plain",
        body: "dress",
        hatColor: C.gold,
        skin: C.paper,
        clothes: C.wine,
      },
      greet: "So. The little fox who's been raiding my henhouse. Sit.",
      chat: [
        "Everything in this room is mine. The cards. The chairs. Soon, your money.",
        "My golden chip opens the Pinnacle. The Baron is expecting someone. Perhaps you.",
      ],
      challenge: "Blackjack, my way. Two decks. Try to keep up.",
      winHand: ["Mine.", "How predictable."],
      loseHand: ["Insolent.", "Enjoy it while it lasts."],
      beaten: "...Well played. The Velvet Fox's golden chip. Go and give the Baron my regards.",
      victory: "Show yourself out.",
      after: "Don't let the Baron see you sweat.",
    },
  },

  pinnacle: {
    id: "pinnacle",
    name: "The Pinnacle",
    tier: 5,
    blurb: "A white marble tower at the end of the Avenue. The Baron's house.",
    welcome: "Marble, gold and silence. The whole Avenue glitters through the windows below.",
    theme: {
      wall: "#d8d2c4",
      wallFg: C.gold,
      carpet: ["#2a0a0e", "#32101a"],
      carpetFg: "#5a2030",
      felt: "#1a3a5a",
      accent: C.gold,
      sign: C.darkRed,
    },
    games: ["blackjack", "slots", "roulette", "craps"],
    bj: { min: 250, max: 5000, rules: [shoe6, double2, shoe6h] },
    roulette: { min: 100, max: 5000, doubleZero: false },
    craps: { min: 100, max: 5000 },
    slotCoin: 100,
    looseChance: 0.1,
    biasChance: 0.25,
    rollers: [
      {
        id: "sterling",
        name: "Sterling Vance III",
        short: "Sterling",
        title: "the oil heir",
        glyph: "S",
        color: C.gold,
        game: "blackjack",
        stake: 50000,
        rules: shoe6h,
        look: {
          hat: "hair",
          eyes: "o o",
          mouth: "─",
          chin: "plain",
          body: "tie",
          hatColor: C.yellow,
          skin: C.pink,
          clothes: C.white,
        },
        greet: "Daddy says I'm not allowed to lose more than fifty thousand a night. Shall we?",
        chat: [
          "I've never actually seen an oil well. I'm told they're dreadfully dirty.",
          "Ingrid frightens me. Rocco frightens me more. The Baron... we don't talk about the Baron.",
        ],
        challenge: "Jolly good. Deal, deal!",
        winHand: ["Smashing!", "Ha! Daddy will be thrilled."],
        loseHand: ["Bother.", "Oh, rotten luck."],
        beaten: "Fifty thousand. Daddy is going to be cross. Well done, old sport.",
        victory: "Toodle-oo!",
        after: "Don't tell Daddy.",
      },
      {
        id: "ingrid",
        name: "Ingrid Steelgaze",
        short: "Ingrid",
        title: "the ice queen of the circuit",
        glyph: "I",
        color: C.cyan,
        game: "poker",
        stake: 60000,
        persona: { tight: 0.55, aggro: 0.55, bluff: 0.35, face: 0.9 },
        look: {
          hat: "bun",
          eyes: "° °",
          mouth: "─",
          chin: "plain",
          body: "coat",
          hatColor: C.white,
          skin: C.paper,
          clothes: C.steel,
        },
        greet: "...",
        chat: ["...", "I have won every tournament on the Avenue. Twice."],
        challenge: "Sit.",
        winHand: ["Mm.", "..."],
        loseHand: ["...", "Fine."],
        beaten: "...Impressive. Go. The Baron will want to see you now.",
        victory: "Next.",
        after: "...",
        tells: {
          strong: ["almost smiles", "stacks her chips perfectly"],
          weak: ["blinks", "touches her necklace"],
          neutral: ["stares", "says nothing at all"],
        },
        tellTip: "Ingrid blinks when she's weak. Watch close - she hardly ever blinks.",
      },
      {
        id: "rocco",
        name: 'Rocco "the Rock" Bellini',
        short: "Rocco",
        title: "the Baron's right hand",
        glyph: "K",
        color: C.steel,
        game: "poker",
        stake: 75000,
        persona: { tight: 0.3, aggro: 0.75, bluff: 0.4, face: 0.5 },
        look: {
          hat: "bald",
          eyes: "o o",
          mouth: "═",
          chin: "plain",
          body: "suit",
          hatColor: C.tan,
          skin: C.tan,
          clothes: C.black,
        },
        greet: "The Baron says I'm supposed to be nice to you. This is me being nice.",
        chat: [
          "I been with the Baron twenty years. Never seen him lose. Never.",
          "You lose to me, you walk outta here. That's the nice version.",
        ],
        challenge: "Sit down before I sit you down.",
        winHand: ["Heh.", "Rock beats everything."],
        loseHand: ["...Watch it.", "Grr."],
        beaten: "...Huh. Okay. The Baron's gonna want to meet you, kid.",
        victory: "Door's that way.",
        after: "No hard feelings. Some hard feelings.",
        tells: {
          strong: ["cracks his knuckles", "grins with a gold tooth"],
          weak: ["loosens his tie", "rubs the back of his neck"],
          neutral: ["rolls his shoulders", "crunches his ice"],
        },
        tellTip: "Rocco loosens his tie when he's sweating a bad hand.",
      },
    ],
    boss: {
      id: "baron",
      name: "The Baron",
      short: "the Baron",
      title: "King of Ace Avenue",
      glyph: "B",
      color: C.gold,
      game: "poker",
      stake: 100000,
      boss: true,
      persona: { tight: 0.5, aggro: 0.7, bluff: 0.35, face: 0.95 },
      look: {
        hat: "tophat",
        eyes: "o ◦",
        mouth: "─",
        chin: "stache",
        body: "suit",
        hatColor: C.black,
        skin: C.paper,
        clothes: C.wine,
      },
      greet: "Ah. The young card sharp from the Rusty Spur. I have been following your career.",
      chat: [
        "Every casino on this Avenue pays me in the end. Every chip. Every bet.",
        "One hundred thousand dollars. Win it, and the Avenue is yours.",
      ],
      challenge: "Five-card draw, then. The oldest game. Let us begin.",
      winHand: ["Naturally.", "The house always wins. I am the house."],
      loseHand: ["Interesting.", "You are better than they said."],
      beaten:
        "...So. A new king of Ace Avenue. Enjoy the view from the top, young one. It's lonely.",
      victory: "Come back when you are ready. The Avenue will wait.",
      after: "Long live the king.",
      tells: {
        strong: ["turns his signet ring", "smiles thinly"],
        weak: ["adjusts his cravat", "pauses half a second too long"],
        neutral: ["sips an old cognac", "studies you"],
      },
      tellTip: "Even the Baron has a tell: he adjusts his cravat when the cards turn on him.",
    },
  },
};

export const ALL_ROLLERS: RollerDef[] = CASINO_ORDER.flatMap((id) => [
  ...CASINOS[id].rollers,
  CASINOS[id].boss,
]);

export const ROLLER_BY_ID: Record<string, RollerDef> = Object.fromEntries(
  ALL_ROLLERS.map((r) => [r.id, r]),
);

/** Which casino a high roller plays in. */
export const ROLLER_CASINO: Record<string, CasinoId> = Object.fromEntries(
  CASINO_ORDER.flatMap((id) => [...CASINOS[id].rollers, CASINOS[id].boss].map((r) => [r.id, id])),
);
