// What a charge that served NONE of its lines is owed (MYK9-966): a paid but
// abandoned cart (MYK9-874), or a paid payment-link session with no link row.
// Deno-free so the colocated vitest drives it.
//
// OWNER RULE (2026-10-03): the platform keeps its service fee even when nothing
// was delivered, so the refund is the lines' entry fees, never the whole charge.
//
// The entry fees come from what STRIPE charged (the session's line items),
// never from database rows: cart line fees are owner-writable after checkout
// without severing the session (Codex round 1 on #2729). When the charged
// lines cannot be fully attributed, the answer is null, which takes the
// caller's existing manual-amount path instead of a guessed refund.

import type { ChargedLine } from './entryPaymentLineItems.ts';
import { calculatePlatformFeeCents, type PlatformFeeRates } from './platformFee.ts';

export type { ChargedLine };

export interface ChargedEntryFeesRefundInput {
  /** The session's line items (loadChargedLinesFromStripe); null = unreadable. */
  lines: ChargedLine[] | null;
  /** What Stripe actually collected. */
  amountTotalCents: number | null;
  /** The rates the session was PRICED with (the stamped rates). */
  rates: PlatformFeeRates;
  /**
   * What the lines must account for: the cart's line count (cart lines carry
   * no metadata), or the entry ids the payment link stamped on the session.
   */
  expected: { entryLineCount: number } | { entryIds: string[] };
}

/**
 * The entry fees Stripe charged, or null when the charge cannot be fully
 * attributed: an unreadable page, an unpriced line, entry lines that do not
 * match what was expected, or entry lines that do not tie out to
 * `amount_total` at the stamped rates.
 */
export function chargedEntryFeesRefundCents(input: ChargedEntryFeesRefundInput): number | null {
  const { lines, amountTotalCents } = input;
  if (!lines || lines.length === 0 || !amountTotalCents || amountTotalCents <= 0) return null;
  if (lines.some(l => typeof l.amountCents !== 'number' || !Number.isInteger(l.amountCents))) {
    return null;
  }
  const entryLines = lines.filter(l => !l.isServiceFee);
  if (entryLines.length === 0) return null;

  if ('entryIds' in input.expected) {
    const expectedIds = new Set(input.expected.entryIds);
    const chargedIds = entryLines.map(l => l.entryId);
    if (
      expectedIds.size !== input.expected.entryIds.length ||
      chargedIds.length !== expectedIds.size ||
      new Set(chargedIds).size !== chargedIds.length ||
      chargedIds.some(id => !id || !expectedIds.has(id))
    ) {
      return null;
    }
  } else if (entryLines.length !== input.expected.entryLineCount) {
    return null;
  }

  const subtotalCents = entryLines.reduce((sum, l) => sum + (l.amountCents as number), 0);
  const feeCents = calculatePlatformFeeCents(subtotalCents, input.rates);
  // THE check: the entry lines plus the fee they price at must be exactly what
  // Stripe collected. A misread fee line, a missing line or a stale amount all
  // fail it.
  if (subtotalCents <= 0 || subtotalCents + feeCents !== amountTotalCents) return null;
  // Tied out, so this equals entryFeeRefundCents(subtotal, subtotal, amount):
  // every entry fee back, the whole service fee kept.
  return subtotalCents;
}

/**
 * The entry ids a payment-link session stamped on its metadata (JSON array, see
 * buildEntryPaymentLinkSession). Anything unreadable is [], which no charged
 * line can match, so the refund falls to the manual-amount path.
 */
export function parseStampedEntryIds(raw: string | null | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '');
    return Array.isArray(parsed) && parsed.every(id => typeof id === 'string') ? parsed : [];
  } catch {
    return [];
  }
}
