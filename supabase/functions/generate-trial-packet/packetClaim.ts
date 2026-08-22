/**
 * The lease that stops two overlapping cron runs from both building a packet
 * for the same trial day (MYK9-228 phase 4).
 *
 * Same shape as `show_eve_nudge_log`'s, which has been live since MYK9-203,
 * but with its own bounds: generating a packet is far heavier than sending a
 * push, and the cron gap is far wider.
 */

/**
 * How long a claim may sit incomplete before another run may take it over.
 *
 * Between two hard bounds, with margin on both sides:
 *   - ABOVE the worst-case run. A three-trial Sunday is ~110 pages to render,
 *     upload, and email; even a very slow one is minutes, not tens of minutes.
 *     A healthy in-flight run must never be robbed of a claim it is working.
 *   - BELOW the gap between cron runs (30 min), so every run can reclaim what
 *     its predecessor abandoned. A lease equal to that gap would sit exactly
 *     on the boundary of the strict `>` below.
 */
export const PACKET_CLAIM_LEASE_MS = 10 * 60 * 1000;

export interface PacketClaimRow {
  claimed_at: string;
  completed_at: string | null;
}

/**
 * A claim exists, but that is only proof a packet was DELIVERED if
 * `completed_at` is set. Otherwise the run may have died mid-render, and
 * reading the unique conflict as "already done" would leave that trial day
 * with no paper at all — the exact failure this whole feature exists to
 * prevent.
 */
export function shouldReclaimStalePacketClaim(row: PacketClaimRow, now: number): boolean {
  if (row.completed_at) return false;
  const claimedAt = Date.parse(row.claimed_at);
  // An unreadable timestamp must not permanently suppress a packet. Retrying
  // risks at worst a duplicate email; skipping risks a trial with no paper,
  // and the two are not comparable.
  if (Number.isNaN(claimedAt)) return true;
  return now - claimedAt > PACKET_CLAIM_LEASE_MS;
}
