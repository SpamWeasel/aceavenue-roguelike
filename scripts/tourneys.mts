// Plays many blackjack tournaments and prints how often each kind of player finishes first and
// second, and what an entry fee is worth to them (break-even is 1.00).
// Usage: pnpm exec tsx scripts/tourneys.mts [tournaments]
import { Shoe } from "../src/game/cards";
import { type Entrant, PRIZES, REGULARS, type TStyle } from "../src/game/data/tourney";
import { Rng } from "../src/game/rng";
import { Tournament } from "../src/game/tournament";

const runs = Number(process.argv[2] ?? 4000);
const rng = new Rng(404);

/** How "you" bet: flat 50 chips, or like a computer player of some style. */
type Plan = "flat" | TStyle;

function play(plan: Plan): { place: number; value: number } {
  const field = rng.shuffle([...REGULARS]).slice(0, 4);
  const you: Entrant = { ...REGULARS[0], id: "you", style: plan === "flat" ? "steady" : plan };
  const t = new Tournament(rng, new Shoe(6, rng), field, you);
  while (t.phase !== "over") {
    if (t.phase === "bet") {
      if (t.you.out) t.bet(0);
      else t.bet(plan === "flat" ? Math.min(50, t.maxBet(t.you)) : t.aiBet(t.you));
    } else if (t.phase === "play") t.act(t.aiMove());
    else t.nextHand();
  }
  return { place: t.place(t.you), value: t.prize(t.you, 100) / 100 };
}

for (const plan of ["flat", "cautious", "steady", "wild"] as Plan[]) {
  let first = 0;
  let second = 0;
  let value = 0;
  for (let i = 0; i < runs; i++) {
    const r = play(plan);
    if (r.place === 1) first++;
    else if (r.place === 2) second++;
    value += r.value;
  }
  console.log(
    `${plan.padEnd(9)} 1st ${((first / runs) * 100).toFixed(1)}%  2nd ${((second / runs) * 100).toFixed(1)}%  fee worth ${(value / runs).toFixed(2)} (prizes ${PRIZES.join("/")})`,
  );
}
