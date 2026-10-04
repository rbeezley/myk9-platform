// Pure helpers shared by stripe-checkout (Deno) and vitest. Keep this module
// free of Deno/npm imports so the colocated test runs under Node.
//
// ── THE FEE EXPRESSION (MYK9-197) ─────────────────────────────────────────
//   fee = max(round(subtotal × percent / 100) + flatCents, minCents)
//
// Three independent instruments, because they do three different jobs:
//
//   percent    scales with the money moved. Covers Stripe's percentage cost.
//   flatCents  is charged once PER CHECKOUT. Stripe's own cost has a flat 30¢
//              per transaction, so a percentage-only fee made the platform's
//              effective take rate depend on how many entries an exhibitor
//              happened to put in one cart (2.70% at N=1 vs 3.76% at N=9 on a
//              $25 entry). The flat component recovers exactly the cost that
//              varies and removes the cart-size dependency.
//   minCents   is a FLOOR on cheap entries, not on small carts. At 7% it only
//              binds below a $14.29 subtotal, so it does nothing at a typical
//              $25 entry — it guards fun matches and single cheap classes.
//              Do not reach for the floor expecting it to fix single-entry
//              carts; that is the flat component's job.
//
// `flatCents` and `minCents` DEFAULT TO 0 in `platform_settings`, so until a
// site admin deliberately sets them THIS expression collapses to exactly the
// percentage-only math that shipped before — the amount CHARGED is unchanged,
// and the setting is the kill switch.
//
// The refund side no longer depends on the fee shape at all: since MYK9-966 a
// refund is the unserved lines' entry fees only (`entryFeeRefundCents`), so no
// part of the percentage, the flat component or the floor is ever returned.
//
// ── THE CLIENT/SERVER AGREEMENT (do not break) ────────────────────────────
// This expression is duplicated in the client cart preview
// (`src/store/cartStore.helpers.ts`). It MUST stay integer math on both sides.
//
// What a divergence actually costs (corrected by the MYK9-197 adversarial
// review, S3): it is NOT a checkout loop. stripe-checkout's drift healer
// compares `entry_cart_items.entry_fee_cents` against `authoritativeEntryFeeCents`
// and nothing else — the platform fee never enters that comparison, and the
// server unconditionally OVERWRITES `entry_carts.platform_fee_cents` /
// `total_cents` rather than reading the client's value back. So a 1¢ fee
// divergence is a silent mismatch between the total the exhibitor reviewed in
// the cart and the total the Stripe page then asks them to pay. Quieter than a
// loop, and worse in one way: nothing in the system notices.
//
// Why the integer form is still load-bearing (corrected, S4): the old comment
// here claimed `Math.round(350 * 0.07)` is 24¢ against the integer form's 25¢.
// It is not — 350 * 0.07 is 24.500000000000004, which rounds to 25, so that
// example never demonstrated anything. The hazard is real at other rates
// though: at 14.5% a 100¢ subtotal is 15¢ via `Math.round((100 * 14.5) / 100)`
// and 14¢ via a float rate (`0.145` is stored as 0.14499999999999999).
// Sweeping all 41 percents on the 0.5 grid (0–20) against every subtotal to
// 200000¢: 14.5% and 17.5% are the ONLY two that diverge, over 1479
// subtotals. That "only two" is contingent on the GRID, not on the column:
// platform_fee_percent is numeric(5,2) with a range-only CHECK, and on the
// 0.01 grid 432 of 2001 percents diverge. The 0.5 step is what makes the
// claim true, and it is enforced in PayoutLedgerPage's percentInvalid and in
// useUpdatePlatformFee — not merely advertised by the input's `step`
// attribute, which the app never reads (MYK9-197 review round 2, S-4).
// Keep the integer form; the agreement test's percent matrix carries both
// diverging values for exactly this reason.
//
// `platformFeeAgreement.test.ts` asserts the two implementations agree.

// Keep in sync with the PLATFORM_FEE_PERCENT secret and the client preview
// (src/store/cartStore.helpers.ts DEFAULT_PLATFORM_FEE_RATES) — raised 3→7 on
// 2026-06-10: 3% didn't cover Stripe's ~2.9% + 30¢ on typical entry carts.
const DEFAULT_FEE_PERCENT = 7;
const MAX_FEE_PERCENT = 20;

// Flat component and floor both default to 0 = "off". The maxima are sanity
// rails on an operator typo, not a pricing opinion: 500¢ is well above Stripe's
// 30¢ and 2000¢ is above any plausible entry fee.
const DEFAULT_FEE_FLAT_CENTS = 0;
const MAX_FEE_FLAT_CENTS = 500;
const DEFAULT_FEE_MIN_CENTS = 0;
const MAX_FEE_MIN_CENTS = 2000;

/** Bounds the admin surface and the migration CHECK constraints both use. */
export const PLATFORM_FEE_LIMITS = {
  minPercent: 0,
  maxPercent: MAX_FEE_PERCENT,
  minFlatCents: 0,
  maxFlatCents: MAX_FEE_FLAT_CENTS,
  minMinCents: 0,
  maxMinCents: MAX_FEE_MIN_CENTS,
} as const;

/** The full fee configuration. Every fee call site takes this, never a bare percent. */
export interface PlatformFeeRates {
  /** Percentage of the subtotal (0–20). */
  percent: number;
  /** Flat component charged once per checkout, in cents (0–500). */
  flatCents: number;
  /** Floor on the whole fee when the subtotal is positive, in cents (0–2000). */
  minCents: number;
}

/** Percentage-only rates — the shape every charge used before MYK9-197. */
export const DEFAULT_PLATFORM_FEE_RATES: PlatformFeeRates = {
  percent: DEFAULT_FEE_PERCENT,
  flatCents: DEFAULT_FEE_FLAT_CENTS,
  minCents: DEFAULT_FEE_MIN_CENTS,
};

function clampCents(value: unknown, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n), max);
}

function clampPercent(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_FEE_PERCENT);
}

/**
 * Coerce arbitrary input into in-range rates. Both the server and the client
 * preview run this before the arithmetic, so a nonsense stored value produces
 * the SAME number on both sides rather than a divergence.
 */
export function normalizePlatformFeeRates(rates: PlatformFeeRates): PlatformFeeRates {
  return {
    percent: clampPercent(rates.percent),
    flatCents: clampCents(rates.flatCents, MAX_FEE_FLAT_CENTS),
    minCents: clampCents(rates.minCents, MAX_FEE_MIN_CENTS),
  };
}

/**
 * The exact integer fee expression. Mirrored verbatim by the client cart
 * preview — change both, or the agreement test fails.
 *
 * A non-positive subtotal earns NO fee at all, floor included: nothing was
 * sold, so there is nothing to take a minimum on.
 */
export function calculatePlatformFeeCents(subtotalCents: number, rates: PlatformFeeRates): number {
  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) return 0;
  const { percent, flatCents, minCents } = normalizePlatformFeeRates(rates);
  const percentCents = percent > 0 ? Math.round((subtotalCents * percent) / 100) : 0;
  return Math.max(percentCents + flatCents, minCents);
}

/**
 * How much of a charge is handed back for the lines it paid for that were
 * never served (cart overflow, payment-link make-whole, a cancelled show).
 *
 * ── OWNER RULE (MYK9-966, 2026-10-03) ─────────────────────────────────────
 * The platform never covers a refund and never refunds its service fee, even
 * when nothing was delivered. A refund is the club's money: the ENTRY FEES of
 * the unserved lines, and nothing else.
 *
 * The one exception (owner, 2026-10-04, MYK9-997): a charge the exhibitor got
 * NOTHING for and no order records (a paid abandoned cart, a paid payment-link
 * session with no link row) is refunded in full, service fee included, and
 * the platform absorbs Stripe's processing fee. That amount is
 * `fullChargeRefundCents` (refundRequests.ts), not this function.
 *
 *   refund = min(unservedEntryFees, amountTotal − fee(fullSubtotal))
 *
 * The cap is what was actually paid minus the service fee charged on the
 * whole cart, so an under-collection (a coupon, a stale price) shrinks the
 * refund rather than the platform's fee. Under the separate-charges model the
 * refund comes from the platform balance, but every refunded entry fee is one
 * the club is never paid (the payout deducts `refund_amount`, and an unserved
 * line was never a payable entry), so the platform is never out of pocket.
 *
 * This REPLACES `makeWholeRefundCents` (MYK9-197), which also returned the
 * share of the fee the unserved lines caused, and its callers, which returned
 * the WHOLE charge when no line was served.
 *
 * The order snapshot books the matching side: `platform_fee_cents` is the full
 * fee charged, `fee(fullSubtotal)`, so the tie-out
 *   amount_cents == entry_subtotal_cents + platform_fee_cents + make_whole_refunded_cents
 * still balances exactly (see `resolveAcceptedEntrySnapshot`).
 */
export function entryFeeRefundCents(input: {
  /** Entry fees of the lines that were paid for and not served. */
  unservedEntryFeeCents: number;
  /** Subtotal of every line the charge paid for. */
  fullSubtotalCents: number;
  /** What Stripe actually collected. */
  amountTotalCents: number;
  /** The rates the charge was PRICED with (the stamped rates, not the live row). */
  rates: PlatformFeeRates;
}): number {
  const serviceFeeCents = calculatePlatformFeeCents(input.fullSubtotalCents, input.rates);
  const capCents = Math.max(0, Math.round(input.amountTotalCents) - serviceFeeCents);
  return Math.max(0, Math.min(Math.round(input.unservedEntryFeeCents), capCents));
}

// A blank or malformed PLATFORM_FEE_PERCENT secret must fall back to the
// default, never silently disable the fee; an explicit '0' disables it.
export function resolvePlatformFeePercent(envValue: string | undefined): number {
  if (envValue === undefined || envValue.trim() === '') return DEFAULT_FEE_PERCENT;
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_FEE_PERCENT) {
    return DEFAULT_FEE_PERCENT;
  }
  return parsed;
}

/**
 * Flat component / floor from a stored or env value. Unlike the percent, a
 * blank or malformed value resolves to 0 rather than a non-zero default:
 * 0 IS the intended default here, so "unset" and "off" are the same answer and
 * a typo can never silently start charging money.
 */
function resolveCents(raw: string | number | null | undefined, max: number): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'string' && raw.trim() === '') return 0;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) return 0;
  return Math.round(parsed);
}

export function resolvePlatformFeeFlatCents(raw: string | number | null | undefined): number {
  return resolveCents(raw, MAX_FEE_FLAT_CENTS);
}

export function resolvePlatformFeeMinCents(raw: string | number | null | undefined): number {
  return resolveCents(raw, MAX_FEE_MIN_CENTS);
}

/** The `platform_settings` columns, as PostgREST hands them back (numeric → string). */
export interface PlatformFeeSettingsRow {
  platform_fee_percent?: number | string | null;
  platform_fee_flat_cents?: number | string | null;
  platform_fee_min_cents?: number | string | null;
}

/**
 * Boot fallback, read from Deno env by the caller (never imported here).
 *
 * PERCENT ONLY, deliberately (MYK9-197 adversarial review, S5). The flat
 * component and the floor had env fallbacks too, and they were a trap: the
 * CLIENT preview has no equivalent — it cannot read Deno secrets — so if
 * PLATFORM_FEE_FLAT_CENTS were ever set and the settings read failed, the server
 * would charge a flat component the cart never showed. Since 0 is already the
 * default for both, an env fallback buys nothing and can only create that
 * asymmetry, so there is none. The percent keeps its fallback because it has a
 * meaningful non-zero default and predates this change.
 */
export interface PlatformFeeEnvFallback {
  percent?: string | undefined;
}

/**
 * Authoritative rates for a charge: the `platform_settings` singleton, each
 * column falling back to its env var and then to its default. Resolved
 * per-column so a row that predates the flat/floor columns still yields a live
 * percent.
 */
export function resolvePlatformFeeRates(
  row: PlatformFeeSettingsRow | null | undefined,
  env: PlatformFeeEnvFallback = {}
): PlatformFeeRates {
  const percentRaw = row?.platform_fee_percent;
  return {
    percent:
      percentRaw !== null && percentRaw !== undefined
        ? resolvePlatformFeePercent(String(percentRaw))
        : resolvePlatformFeePercent(env.percent),
    // No env fallback: absent column, unreadable row and "switched off" are all
    // 0, which is exactly what the client preview shows in the same situation.
    flatCents: resolvePlatformFeeFlatCents(row?.platform_fee_flat_cents),
    minCents: resolvePlatformFeeMinCents(row?.platform_fee_min_cents),
  };
}

/** Stripe metadata keys carrying the rates a session was actually priced with. */
export const PLATFORM_FEE_METADATA_KEYS = {
  percent: 'platform_fee_percent',
  flatCents: 'platform_fee_flat_cents',
  minCents: 'platform_fee_min_cents',
} as const;

/** A type alias, not an interface: only an alias carries an implicit index
 *  signature, which is what lets a stamped object be handed straight back to
 *  `decodeStampedPlatformFeeRates` (and spread into Stripe's metadata bag). */
export type StampedPlatformFeeRates = {
  platform_fee_percent: string;
  platform_fee_flat_cents: string;
  platform_fee_min_cents: string;
};

/** Stamp the rates onto a Checkout Session so the webhook validates the CHARGED rate. */
export function stampPlatformFeeRates(rates: PlatformFeeRates): StampedPlatformFeeRates {
  const normalized = normalizePlatformFeeRates(rates);
  return {
    platform_fee_percent: String(normalized.percent),
    platform_fee_flat_cents: String(normalized.flatCents),
    platform_fee_min_cents: String(normalized.minCents),
  };
}

/**
 * Read back the rates a session was priced with.
 *
 * The flat component and the floor fall back to 0 when the stamp is ABSENT —
 * NOT to the env var and not to the live row. A session created before these
 * columns existed was charged percentage-only, so re-validating it against a
 * live non-zero flat would reject a correctly-charged payment and leave the
 * exhibitor paid with no entries. The percent keeps its historical env
 * fallback because it has always been stamped and has a meaningful default.
 */
export function decodeStampedPlatformFeeRates(
  metadata: Record<string, string> | null | undefined,
  envPercent: string | undefined
): PlatformFeeRates {
  return {
    percent: resolvePlatformFeePercent(
      metadata?.[PLATFORM_FEE_METADATA_KEYS.percent] ?? envPercent
    ),
    flatCents: resolvePlatformFeeFlatCents(metadata?.[PLATFORM_FEE_METADATA_KEYS.flatCents]),
    minCents: resolvePlatformFeeMinCents(metadata?.[PLATFORM_FEE_METADATA_KEYS.minCents]),
  };
}
