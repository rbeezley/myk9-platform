/**
 * The one English ordinal rule for @myk9/ringside: 1 becomes "1st", 12 becomes
 * "12th", 22 becomes "22nd", 111 becomes "111th". Dependency-free, so it can sit
 * in runQueue's import graph (see runQueue.imports.test.ts).
 */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  const last = n % 10;
  if (last === 1) return `${n}st`;
  if (last === 2) return `${n}nd`;
  if (last === 3) return `${n}rd`;
  return `${n}th`;
}
