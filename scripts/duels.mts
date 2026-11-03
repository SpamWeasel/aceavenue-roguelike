// Plays many duels with a simple bot against each high roller and prints how often it wins.
// Usage: pnpm exec tsx scripts/duels.mts [matches]
import { type BjRules, BlackjackRound, basicStrategy } from "../src/game/blackjack";
import { evalPoker, Shoe } from "../src/game/cards";
import { ALL_ROLLERS } from "../src/game/data/casinos";
import {
  drawStrength,
  flushDraw,
  madeStrength,
  type PokerAction,
  PokerMatch,
  straightDraw,
} from "../src/game/poker";
import { Rng } from "../src/game/rng";

const matches = Number(process.argv[2] ?? 300);

/** A steady player: bets strong hands, calls fair ones, bluffs now and then. */
function botAction(h: ReturnType<PokerMatch["newHand"]>, rng: Rng): PokerAction {
  const opts = h.options();
  const s = h.phase === "bet1" ? drawStrength(h.cards.you) : madeStrength(h.cards.you);
  const can = (a: PokerAction) => opts.includes(a);
  if (s > 0.7 && can("raise")) return "raise";
  if (s > 0.55 && can("bet")) return "bet";
  if (can("bet") && rng.chance(0.12)) return "bet";
  if (can("check")) return "check";
  if (s > 0.33) return "call";
  return "fold";
}

function botDiscards(cards: ReturnType<PokerMatch["newHand"]>["cards"]["you"]): number[] {
  const v = evalPoker(cards);
  if (v.cat >= 4) return [];
  if (v.cat >= 1) return [0, 1, 2, 3, 4].filter((i) => !v.used.includes(i));
  const f = flushDraw(cards);
  if (f >= 0) return [f];
  const st = straightDraw(cards);
  if (st >= 0) return [st];
  const order = [0, 1, 2, 3, 4].sort((a, b) => cards[b].rank - cards[a].rank);
  return order.slice(2);
}

function pokerMatch(
  stake: number,
  persona: NonNullable<(typeof ALL_ROLLERS)[0]["persona"]>,
  rng: Rng,
): boolean {
  const m = new PokerMatch(rng, stake, persona, 0);
  for (let n = 0; n < 3000 && !m.winner(); n++) {
    const h = m.newHand();
    while (h.phase !== "done") {
      if (h.phase === "draw")
        h.draw(h.toAct, h.toAct === "them" ? h.aiDiscards() : botDiscards(h.cards.you));
      else h.act(h.toAct === "them" ? h.aiAction() : botAction(h, rng));
    }
    m.finishHand();
  }
  return m.winner() === "you";
}

function bjMatch(stake: number, rules: BjRules, rng: Rng): boolean {
  const shoe = new Shoe(rules.decks, rng, rules.decks === 1 ? 0.65 : 0.75);
  const min = Math.max(1, Math.round(stake / 20));
  let you = stake;
  let them = stake;
  for (let n = 0; n < 5000 && you >= min && them >= min; n++) {
    if (shoe.needsShuffle()) shoe.shuffle();
    const r = new BlackjackRound(shoe, rules, min);
    if (r.phase === "insurance") r.decideInsurance(false);
    while (r.phase === "play") {
      const m = basicStrategy(r.hand.cards, r.upCard, rules, r.canDouble(), r.canSplit());
      if (m === "H") r.hit();
      else if (m === "S") r.stand();
      else if (m === "D") r.double();
      else r.split();
    }
    const net = Math.min(them, r.net);
    you += net;
    them -= net;
  }
  return them < min;
}

const rng = new Rng(2026);
for (const r of ALL_ROLLERS) {
  let wins = 0;
  for (let i = 0; i < matches; i++)
    if (
      r.game === "poker"
        ? pokerMatch(r.stake, r.persona as NonNullable<typeof r.persona>, rng)
        : bjMatch(r.stake, r.rules as BjRules, rng)
    )
      wins++;
  console.log(
    `${r.name.padEnd(28)} ${r.game.padEnd(10)} bot wins ${((wins / matches) * 100).toFixed(0)}%`,
  );
}
