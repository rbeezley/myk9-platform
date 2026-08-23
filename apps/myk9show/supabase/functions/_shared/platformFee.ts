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
// site admin deliberately sets them the expression collapses to exactly the
// percentage-only math that shipped before. The setting is the kill switch.
//
// ── THE CLIENT/SERVER AGREEMENT (do not break) ────────────────────────────
// This expression is duplicated in the client cart preview
// (`src/store/cartStore.helpers.ts`). It MUST stay integer math on both sides:
// 350¢ at 7% is 25¢ via `Math.round(350 * 7 / 100)` and 24¢ via
// `Math.round(350 * 0.07)`. A 1¢ divergence is not a rounding error — the
// stripe-checkout drift healer reacts to a cart/charge mismatch by rewriting
// the cart and asking the user to re-review, so it becomes a checkout loop.
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
 * sold, so there is nothing to take a minimum on (a fully make-whole-refunded
 * payment-link order snapshots as 0/0 through this path).
 */
export function calculatePlatformFeeCents(
  subtotalCents: number,
  rates: PlatformFeeRates
): number {
  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) return 0;
  const { percent, flatCents, minCents } = normalizePlatformFeeRates(rates);
  const percentCents = percent > 0 ? Math.round((subtotalCents * percent) / 100) : 0;
  return Math.max(percentCents + flatCents, minCents);
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

/** Boot fallbacks, read from Deno env by the caller (never imported here). */
export interface PlatformFeeEnvFallback {
  percent?: string | undefined;
  flatCents?: string | undefined;
  minCents?: string | undefined;
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
    flatCents:
      row?.platform_fee_flat_cents !== null && row?.platform_fee_flat_cents !== undefined
        ? resolvePlatformFeeFlatCents(row.platform_fee_flat_cents)
        : resolvePlatformFeeFlatCents(env.flatCents),
    minCents:
      row?.platform_fee_min_cents !== null && row?.platform_fee_min_cents !== undefined
        ? resolvePlatformFeeMinCents(row.platform_fee_min_cents)
        : resolvePlatformFeeMinCents(env.minCents),
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
