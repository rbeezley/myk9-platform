import type { CartItemWithDetails } from '@/store/cartStore';

/**
 * A cart line in a test, with what the server's availability read says about its class:
 * whether it takes a wait list (`allow_waitlist`, the effective value, MYK9-1019). The cart
 * never reads that off the line; it gets it from `cartCapacityFromJudgeDays`'s
 * `waitlistClassIds`, which these fixtures build with `serverWaitlistClassIds`.
 */
export type CartTestLine = CartItemWithDetails & { serverTakesWaitlist?: boolean };

/** The classes the server would report as taking a wait list, for these test lines. */
export function serverWaitlistClassIds(lines: readonly CartTestLine[]): string[] {
  return [...new Set(lines.filter(line => line.serverTakesWaitlist).map(line => line.class_id))];
}
