/**
 * Capacity is server-enforced for online entries, but a judge-day can sit above
 * its limit on purpose: the limit was lowered after entries existed, or a
 * secretary/late entry carried a capacity override. The data the capacity card
 * holds does not record which, so the wording stays neutral.
 *
 * Returns null when the day is at or under its limit.
 */
export function overLimitCount(confirmed: number, capacity: number): number {
  return Math.max(0, confirmed - capacity);
}

export function overLimitLabel(confirmed: number, capacity: number): string | null {
  const over = overLimitCount(confirmed, capacity);
  return over > 0 ? `${over} over the limit` : null;
}

export const OVER_LIMIT_EXPLANATION =
  'The limit was lowered after entries came in, or an entry was added past it.';
