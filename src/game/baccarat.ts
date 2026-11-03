import type { Card, Shoe } from "./cards";

/** Punto banco: bet on the Player's hand, the Banker's hand, or a tie. Nobody makes choices. */
export type BaccaratBet = "player" | "banker" | "tie";

/** Baccarat value: aces 1, tens and faces 0. */
export const bacValue = (c: Card) => (c.rank === 14 ? 1 : c.rank >= 10 ? 0 : c.rank);
export const bacTotal = (cards: readonly Card[]) => cards.reduce((s, c) => s + bacValue(c), 0) % 10;

/** Banker wins pay 95% (the house keeps a 5% commission); a tie pays 8 to 1. */
export const BANKER_PAYS = 0.95;
export const TIE_PAYS = 8;

export interface BaccaratCoup {
  player: Card[];
  banker: Card[];
  winner: BaccaratBet;
  /** Short notes on the drawing, for the screen. */
  notes: string[];
}

/** Deals one coup from the shoe, following the fixed drawing rules. */
export function dealCoup(shoe: Shoe): BaccaratCoup {
  const player = [shoe.draw(), shoe.draw()];
  const banker = [shoe.draw(), shoe.draw()];
  const notes: string[] = [];
  const p = bacTotal(player);
  const b = bacTotal(banker);
  if (p >= 8 || b >= 8) notes.push("A natural!");
  else {
    let third: Card | null = null;
    if (p <= 5) {
      third = shoe.draw();
      player.push(third);
      notes.push("Player draws.");
    } else notes.push("Player stands.");
    if (bankerDraws(b, third)) {
      banker.push(shoe.draw());
      notes.push("Banker draws.");
    } else notes.push("Banker stands.");
  }
  const pt = bacTotal(player);
  const bt = bacTotal(banker);
  return { player, banker, winner: pt > bt ? "player" : bt > pt ? "banker" : "tie", notes };
}

/** The banker's drawing rule, given the player's third card (null if the player stood). */
export function bankerDraws(total: number, third: Card | null): boolean {
  if (!third) return total <= 5;
  const t = bacValue(third);
  if (total <= 2) return true;
  if (total === 3) return t !== 8;
  if (total === 4) return t >= 2 && t <= 7;
  if (total === 5) return t >= 4 && t <= 7;
  if (total === 6) return t === 6 || t === 7;
  return false;
}

/** Money returned for a bet of `amount` (stake included). */
export function bacReturn(bet: BaccaratBet, amount: number, winner: BaccaratBet): number {
  if (winner === "tie") return bet === "tie" ? amount * (TIE_PAYS + 1) : amount;
  if (bet !== winner) return 0;
  return bet === "banker" ? amount + Math.floor(amount * BANKER_PAYS) : amount * 2;
}
