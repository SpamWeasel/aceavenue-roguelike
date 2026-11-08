# Ace Avenue - notes for development

An original ASCII casino roguelike inspired by the NES game Casino Kid. Walk the casino floors
(turn-based, 8-way movement), build a bankroll at the house games, and beat each casino's high
rollers in one-on-one duels, then its boss. Separate project from Rumble Row; the Electron
setup (saves, smoke tests, packaging) is copied from it.

## Rules

- **Originality:** no names, characters, text or places from Casino Kid. Casinos, high rollers,
  lines and tells are our own.
- **Game rules stay pure:** `src/game` never touches the DOM. Screens read `game.s` / `game.area`,
  call `Game` methods, and play `game.sounds` (the app drains them every frame).
- **Content is data:** casinos, house limits, table rules and every high roller (persona, tells,
  lines, portrait, reward) live in `data/casinos.ts`; skills, items and drinks in
  `data/items.ts`; Avenue shops and gossip in `data/shops.ts`.
- **Card games are engines:** `blackjack.ts` (`BlackjackRound`, `basicStrategy`), `poker.ts`
  (`PokerHand`, `PokerMatch`, the AI and tells), `roulette.ts`, `slots.ts` (paybacks are
  solved exactly per machine with `blanksFor`), `craps.ts`. Screens only drive them.
- **Floors** come from `buildCasino(casino, seed)`: a 7x3 grid of stations with aisles between,
  VIP room top middle, bar on one side, lobby and exit at the bottom. Fixed per game; the
  people (`populate`) change every visit. `tests/world.test.ts` checks every table, machine and
  roller can be reached for 40 seeds.
- **Duels:** `startDuel` takes the stake from your cash and keeps the table stack in `s.duel`
  (updated by `duelStack`) so closing the game mid-duel just walks you away with it.
  `endDuel` pays out, records the win, hands over `reward` and golden chips.
- **Heat** (`houseResult` / `addHeat`): big wins, jackpots, raising bets on a hot count and
  cheat items add heat; the pit boss nearby doubles it; Charm and the horseshoe cut it. At 100
  you're walked out and banned until heat drops below 50 (+10 per Charm). Motel clears it all.
- **Broke** (`checkBroke`): the run ends only with no cash, nothing to pawn and an unpaid loan.
- **0.2 "Lucky Streak":** `videopoker.ts` (Jacks or Better, `VP_TABLES` 9/6..6/5, `vpHint`
  is the Card Sense hold advice) on `T.video` tiles listed in `area.videos`; `baccarat.ts`
  (`dealCoup` follows the drawing rules) at casinos with a `baccarat` config. Floor events are
  rolled in `floorEvents` each visit: `hotTable` (bjPays 2 at one table), the millionaire
  (`cutDeck`), the pickpocket (`pickpocketTurn`: one turn of warning beside you, then he
  steals; bumping him first calls `catchPickpocket`), and the rival Dutch (`RIVAL` in
  casinos.ts, `rivalDef()` scales stake/persona, `endRivalDuel`, never in `s.beaten`, use
  `rollerById`). Comp points: `houseResult` adds bet / `compUnit`; `redeem` at the cage.
- **0.3 "Riverboat":** the Magnolia Belle (`belle`) is a *side* casino (`side: true`): it's in
  `ALL_CASINOS` but not `CASINO_ORDER`, so it never gives a golden chip or changes `tier`;
  its boss hands over the Baron's tell instead. Its door is on the east end of the Avenue
  (`T.water` beside it). `liarsdice.ts` (`DiceRound`/`DiceMatch`, rollers with
  `game: "dice"` reuse `PokerPersona`; a die lost is a fifth of the stake if you walk away,
  the last with dice takes the pot) and `chuckaluck.ts` (`chuck` tables). Dutch never boards.
  The Insurance Policy (`claimPolicy`) pays half the stake on a lost duel unless you were
  caught cheating; `s.duel.stake` remembers the stake for it.
- **0.4 "Tournament Night":** `tournament.ts` (`Tournament`: five seats, one shared dealer, no
  splits or insurance; `aiBet` bets by `TStyle` and chases/protects in the last three hands;
  `stack()` counts the bet in play; `prize()` splits ties). Data in `data/tourney.ts`
  (regulars, fees, prizes). A `tourney` table on every floor. `Game.tourneyField` is seeded
  by `night` (noon to noon, so the motel always brings a new one); `s.tourneys` remembers
  the night you last played each casino, `s.trophies` where you won.
  `scripts/tourneys.mts` checks the prizes: betting like the table is about break-even.
- **Saves:** whole `State` as JSON, `SAVE_VERSION` 4 (0.3 saves get empty tournament fields);
  before that, 3 (`Game.load` fills `comps` and `rival`
  for 0.1 saves and moves you to the entry if a floor change put you inside a table; 0.2 saves
  need nothing new).
  3 slots in `%APPDATA%\AceAvenue\Saves` with rolling backups (from Rumble Row). A save is valid if it has numeric `version` and `cash`.
- **Drawing:** `Term.draw` works in device pixels and snaps every rectangle, otherwise scaled
  displays show seams between cells.

## Tools

- `pnpm dev:web` runs it in a browser (port 5197); `pnpm dev` runs the desktop window.
- `pnpm check` = typecheck + Biome (pinned 2.5.15) + tests.
- `pnpm smoke` builds, then opens each screen in the real app and writes screenshots and
  reports to `.smoke/` (scenes are listed in `scripts/smoke.mjs`, set up in `renderer/src/main.ts`).
- Floor layouts may change between versions (new stations shift the seeded layout); that's
  fine as long as `Game.load` keeps you on a walkable square.
- `pnpm exec tsx scripts/duels.mts [matches]` plays bot duels against every high roller and
  prints win rates (0.1: most 35-55% for a simple bot; Hank and Fontaine ~30%: they punish
  calling stations. 0.3 dice: Zeke ~50%, Delphine ~45%, the Captain ~39%).
- `pnpm dist` builds Windows zips, portable exes and installers for x64 and ARM64 into
  `release/<version>/` (BCJ 7-Zip filter forced, see `scripts/dist.mjs`).
- `pnpm exec tsx scripts/make-icon.mts` redraws the ace-of-spades icon.
- Biome's `noVoidTypeReturn`: write `{ this.say(...); return; }`, not `return this.say(...)`.
- Editing code with a Node script? Use `s.replace(a, () => b)`: a plain string replacement turns
  `$$` into `$`.
