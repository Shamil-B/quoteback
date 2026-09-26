/** Rough token estimate. Good enough for budgeting a context block; not for billing. */
export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 3.8);
}
