/* Pickleball score rules: games go to 11, win by 2. At 10–10 play goes on until someone leads by 2
   (12–10, 13–11, …), so past 11 the margin is always exactly 2. Scores are whole numbers, 0 to MAX_SCORE. */
export const WIN_AT = 11;
export const MAX_SCORE = 30;

/** Keep what someone types to a whole number between 0 and MAX_SCORE ("" stays empty). */
export function cleanScore(v: string): string {
  const d = v.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 2);
  return d === "" ? "" : String(Math.min(+d, MAX_SCORE));
}

/** Why this pair of scores can't be a finished game, or null if it can (or both are blank). */
export function scoreProblem(a: number | null, b: number | null): string | null {
  if (a == null && b == null) return null;
  if (a == null || b == null) return "Enter both scores, or clear them and just tap who won.";
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return "Scores are whole numbers, 0 or more.";
  if (a > MAX_SCORE || b > MAX_SCORE) return `Scores top out at ${MAX_SCORE}.`;
  const hi = Math.max(a, b), lo = Math.min(a, b);
  if (hi === lo) return "A game can't end in a tie.";
  if (hi < WIN_AT) return `The winner needs at least ${WIN_AT} points.`;
  if (hi - lo < 2) return `Win by 2: ${hi}–${lo} keeps going until someone leads by 2.`;
  if (hi > WIN_AT && hi - lo > 2) return `Past ${WIN_AT}, the game ends once someone leads by 2. Did you mean ${hi}–${hi - 2} or ${WIN_AT}–${lo}?`;
  return null;
}

/** The only score the other team can have, when there is just one: anything under 10 means they got to 11. */
export function otherScore(n: number): number | null {
  return n <= WIN_AT - 2 ? WIN_AT : null;
}
