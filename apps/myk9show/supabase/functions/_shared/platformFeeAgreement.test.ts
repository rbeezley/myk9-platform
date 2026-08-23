// @vitest-environment node
//
// THE CLIENT/SERVER AGREEMENT TEST (MYK9-197).
//
// The platform fee expression is implemented TWICE: once in this directory
// (`platformFee.ts`, authoritative for the charge) and once in the client cart
// preview (`src/store/cartStore.helpers.ts`). This file is the thing that keeps
// that duplication safe. Both modules are imported HERE, into one process, and
// asserted to return the identical integer for the same input.
//
// What a 1¢ divergence actually costs (corrected by the MYK9-197 adversarial
// review, S3): NOT a checkout loop. stripe-checkout's drift healer compares
// `entry_cart_items.entry_fee_cents` against `authoritativeEntryFeeCents` and
// nothing else — the platform fee is never in that comparison, and the server
// OVERWRITES the cart's `platform_fee_cents` / `total_cents` rather than reading
// the client's value back. So a divergence is a silent mismatch between the
// total the exhibitor reviewed and the total Stripe then charges. Nothing in
// the system notices it, which is why this test has to.
//
// `// @vitest-environment node` because this file sits with edge-function code:
// the app suite is jsdom-global, which is a lie for anything that runs on Deno.
//
// Registration: `supabase/functions/_shared/*.test.ts` is already globbed by
// BOTH `vitest.config.ts` test.include and `tsconfig.edge-tests.json` include,
// so this file runs in CI and is typechecked without a new allowlist entry.

import { describe, it, expect } from 'vitest';
import {
  calculatePlatformFeeCents as serverFee,
  normalizePlatformFeeRates as serverNormalize,
  decodeStampedPlatformFeeRates,
  resolvePlatformFeeRates,
  stampPlatformFeeRates,
  DEFAULT_PLATFORM_FEE_RATES as SERVER_DEFAULTS,
  type PlatformFeeRates,
} from './platformFee';
import {
  calculatePlatformFeeCents as clientFee,
  normalizePlatformFeeRates as clientNormalize,
  formatPlatformFeeLabel,
  DEFAULT_PLATFORM_FEE_RATES as CLIENT_DEFAULTS,
} from '@/store/cartStore.helpers';

const rates = (percent: number, flatCents = 0, minCents = 0): PlatformFeeRates => ({
  percent,
  flatCents,
  minCents,
});

/**
 * Half-cent boundaries: subtotals where `subtotal × percent / 100` lands on
 * exactly x.5, so the two implementations round apart if either one drifts to
 * float-percent math.
 *
 * NOTE — the long-repeated `350¢ at 7%` example was FALSE and is not why these
 * matter. `Math.round(350 * 0.07)` is 25, not 24: 350 * 0.07 evaluates to
 * 24.500000000000004. The real float hazard lives at other admin-reachable
 * rates and is covered by FLOAT_DIVERGENCE_CASES below.
 */
const HALF_CENT_CASES: Array<{ subtotal: number; percent: number; expected: number }> = [
  { subtotal: 350, percent: 7, expected: 25 }, // 24.5 → 25
  { subtotal: 1050, percent: 7, expected: 74 }, // 73.5 → 74
  { subtotal: 1750, percent: 7, expected: 123 }, // 122.5 → 123
  { subtotal: 50, percent: 3, expected: 2 }, // 1.5 → 2
  { subtotal: 150, percent: 3, expected: 5 }, // 4.5 → 5
  { subtotal: 10, percent: 5, expected: 1 }, // 0.5 → 1
  { subtotal: 30, percent: 5, expected: 2 }, // 1.5 → 2
  { subtotal: 25, percent: 2, expected: 1 }, // 0.5 → 1
  { subtotal: 75, percent: 2, expected: 2 }, // 1.5 → 2
  { subtotal: 3333, percent: 1.5, expected: 50 }, // 49.995 → 50
];

// A realistic matrix: entry fees $0–$250 across cart sizes 1–9, plus the odd
// values that expose rounding. 0/0 flat+floor is today's shipped configuration;
// 30/0 is the adopted one; 0/100 and 30/100 exercise the floor.
const ENTRY_FEES_CENTS = [0, 1, 99, 350, 500, 1000, 1429, 1500, 2500, 4999, 7550, 25000];
const CART_SIZES = [1, 2, 3, 4, 5, 9];
// 14.5 and 17.5 are load-bearing, not decoration: swept exhaustively, they are
// the ONLY two of the 41 percents on the enforced 0.5 grid (0–20) at which a
// float rate diverges from the integer expression — 1479 subtotals under
// 200000¢ between them, because 0.145 is stored as 0.14499999999999999. A
// matrix without them let a `Math.round(s * (p / 100))` mutant survive this
// suite; that gap was itself a review finding.
//
// "Only two" holds because the step is ENFORCED (PayoutLedgerPage
// percentInvalid + useUpdatePlatformFee). The column is numeric(5,2) with a
// range-only CHECK, so on a 0.01 grid 432 of 2001 percents diverge — if that
// step check is ever removed, this matrix stops being representative.
const PERCENTS = [0, 1.5, 2.5, 3, 7, 7.5, 12.25, 14.5, 17.5, 20];
const FLATS = [0, 30, 99, 500];
const FLOORS = [0, 100, 175, 2000];

/**
 * The subtotal/percent pairs where a FLOAT rate genuinely disagrees with the
 * integer expression, at percents an operator can actually save (0–20 on the
 * enforced 0.5 grid). These are what make the integer form load-bearing; the
 * famous 350¢/7% example never was.
 *
 * Verified by exhaustive sweep: on that grid 14.5% and 17.5% are the only two
 * such percents, with 1479 divergent subtotals under 200000¢ between them.
 */
const FLOAT_DIVERGENCE_CASES: Array<{ subtotal: number; percent: number; expected: number }> = [
  { subtotal: 100, percent: 14.5, expected: 15 },
  { subtotal: 1500, percent: 14.5, expected: 218 },
  { subtotal: 2900, percent: 14.5, expected: 421 },
  { subtotal: 180, percent: 17.5, expected: 32 },
  { subtotal: 700, percent: 17.5, expected: 123 },
  { subtotal: 1300, percent: 17.5, expected: 228 },
];

describe('client and server platform fee implementations agree', () => {
  it('agrees on the documented half-cent boundaries, at the shipped 0/0 config', () => {
    for (const { subtotal, percent, expected } of HALF_CENT_CASES) {
      const r = rates(percent);
      expect(serverFee(subtotal, r)).toBe(expected);
      expect(clientFee(subtotal, r)).toBe(expected);
    }
  });

  it('agrees on half-cent boundaries with the flat component and the floor on', () => {
    for (const { subtotal, percent, expected } of HALF_CENT_CASES) {
      for (const flatCents of FLATS) {
        for (const minCents of FLOORS) {
          const r = rates(percent, flatCents, minCents);
          const expectedFee = Math.max(expected + flatCents, minCents);
          expect(serverFee(subtotal, r)).toBe(expectedFee);
          expect(clientFee(subtotal, r)).toBe(serverFee(subtotal, r));
        }
      }
    }
  });

  it('agrees where a FLOAT rate would diverge from the integer expression', () => {
    // The real reason both sides must keep integer math.
    for (const { subtotal, percent, expected } of FLOAT_DIVERGENCE_CASES) {
      const r = rates(percent);
      expect(serverFee(subtotal, r)).toBe(expected);
      expect(clientFee(subtotal, r)).toBe(expected);
      // Prove each case actually discriminates, so a future edit cannot quietly
      // turn this into a list of values every implementation agrees on.
      expect(Math.round(subtotal * (percent / 100))).toBe(expected - 1);
    }
  });

  it('agrees at EVERY admin-reachable percent, not just the sampled ones', () => {
    // The percent field enforces a 0.5 step over 0–20, so these are all 41
    // values an operator can save. Sampling a handful is what let a float-rate
    // mutant survive this suite once already.
    for (let percent = 0; percent <= 20; percent += 0.5) {
      const r = rates(percent, 30, 100);
      for (const subtotal of [1, 100, 149, 300, 350, 500, 1000, 2500, 7550, 25000]) {
        expect(clientFee(subtotal, r)).toBe(serverFee(subtotal, r));
      }
    }
  });

  it('agrees across the entry-fee × cart-size × rates matrix', () => {
    let compared = 0;
    for (const entryFee of ENTRY_FEES_CENTS) {
      for (const size of CART_SIZES) {
        const subtotal = entryFee * size;
        for (const percent of PERCENTS) {
          for (const flatCents of FLATS) {
            for (const minCents of FLOORS) {
              const r = rates(percent, flatCents, minCents);
              const server = serverFee(subtotal, r);
              expect(clientFee(subtotal, r)).toBe(server);
              expect(Number.isInteger(server)).toBe(true);
              compared += 1;
            }
          }
        }
      }
    }
    // Guards the loop itself: a broken matrix that compares nothing would
    // otherwise pass silently.
    expect(compared).toBe(
      ENTRY_FEES_CENTS.length *
        CART_SIZES.length *
        PERCENTS.length *
        FLATS.length *
        FLOORS.length
    );
  });

  it('agrees on every subtotal from 0¢ to 5000¢ at the adopted 7% + 30¢ config', () => {
    const r = rates(7, 30, 100);
    for (let subtotal = 0; subtotal <= 5000; subtotal += 1) {
      expect(clientFee(subtotal, r)).toBe(serverFee(subtotal, r));
    }
  });

  it('agrees on non-positive and non-finite subtotals', () => {
    for (const subtotal of [0, -1, -2500, Number.NaN, Number.POSITIVE_INFINITY * 0]) {
      for (const r of [rates(7), rates(7, 30), rates(7, 30, 100), rates(0, 0, 500)]) {
        expect(serverFee(subtotal, r)).toBe(0);
        expect(clientFee(subtotal, r)).toBe(serverFee(subtotal, r));
      }
    }
  });

  it('agrees on out-of-range and malformed rates, because both normalize first', () => {
    const nonsense: PlatformFeeRates[] = [
      rates(Number.NaN, Number.NaN, Number.NaN),
      rates(-5, -10, -20),
      rates(999, 9999, 99999),
      rates(7, 30.4, 100.6),
      rates(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
    ];
    for (const r of nonsense) {
      expect(clientNormalize(r)).toEqual(serverNormalize(r));
      for (const subtotal of [1, 350, 2500, 25000]) {
        expect(clientFee(subtotal, r)).toBe(serverFee(subtotal, r));
      }
    }
  });

  it('ships the same fallback defaults on both sides', () => {
    expect(CLIENT_DEFAULTS).toEqual(SERVER_DEFAULTS);
    // The defaults must be the percentage-only configuration: flat and floor are
    // OFF until a site admin deliberately sets them, so this change is inert on
    // arrival and `platform_settings` is the kill switch.
    expect(SERVER_DEFAULTS.flatCents).toBe(0);
    expect(SERVER_DEFAULTS.minCents).toBe(0);
  });
});

describe('the flat component and the floor do what the issue says they do', () => {
  it('removes the cart-size dependency of the platform take', () => {
    // $25 entry, 7%, Stripe at 2.9% + 30¢. Net per entry with a percentage-only
    // fee swings from $0.674 at one entry to $0.941 at nine — a 28% spread for
    // identical work. With a 30¢ flat component it is flat to within a cent.
    const entryCents = 2500;
    const netPerEntry = (size: number, r: PlatformFeeRates): number => {
      const subtotal = entryCents * size;
      const fee = serverFee(subtotal, r);
      const stripeCost = (subtotal + fee) * 0.029 + 30;
      return (fee - stripeCost) / size;
    };

    const percentOnly = [1, 2, 4, 9].map(n => netPerEntry(n, rates(7)));
    const percentOnlySpread = Math.max(...percentOnly) - Math.min(...percentOnly);
    expect(percentOnlySpread).toBeGreaterThan(20); // >20¢ per entry, cart-size dependent

    const withFlat = [1, 2, 4, 9].map(n => netPerEntry(n, rates(7, 30)));
    const withFlatSpread = Math.max(...withFlat) - Math.min(...withFlat);
    expect(withFlatSpread).toBeLessThan(1); // under a cent — cart size no longer matters
    expect(withFlatSpread).toBeLessThan(percentOnlySpread);
  });

  it('leaves a typical $25 entry untouched by a $1.00 floor', () => {
    // The floor guards CHEAP entries, not small carts: 7% of $25 is already
    // $1.75, so the floor never binds there. Do not adopt it expecting it to fix
    // single-entry carts — that is the flat component's job.
    expect(serverFee(2500, rates(7, 0, 100))).toBe(serverFee(2500, rates(7)));
    expect(serverFee(2500, rates(7))).toBe(175);
    // A $10 entry is where it earns its keep: 70¢ → 100¢.
    expect(serverFee(1000, rates(7))).toBe(70);
    expect(serverFee(1000, rates(7, 0, 100))).toBe(100);
    // It binds below a $14.29 subtotal at 7% and not above it.
    expect(serverFee(1428, rates(7, 0, 100))).toBe(100);
    expect(serverFee(1429, rates(7, 0, 100))).toBe(100);
    expect(serverFee(1430, rates(7, 0, 100))).toBe(100);
    expect(serverFee(1500, rates(7, 0, 100))).toBe(105);
  });

  it('is exactly the percentage-only fee while flat and floor are 0', () => {
    for (const subtotal of [1, 350, 2500, 10700, 25000]) {
      for (const percent of PERCENTS) {
        expect(serverFee(subtotal, rates(percent, 0, 0))).toBe(
          percent > 0 ? Math.round((subtotal * percent) / 100) : 0
        );
      }
    }
  });
});

describe('rate resolution and the Stripe metadata round trip', () => {
  it('reads each platform_settings column, falling back per column', () => {
    expect(
      resolvePlatformFeeRates({
        platform_fee_percent: '7.00',
        platform_fee_flat_cents: 30,
        platform_fee_min_cents: '100',
      })
    ).toEqual(rates(7, 30, 100));

    // A row that predates the flat/floor columns still yields a live percent.
    expect(resolvePlatformFeeRates({ platform_fee_percent: '5.50' })).toEqual(rates(5.5, 0, 0));

    // No row at all: env for the percent, then the defaults.
    expect(resolvePlatformFeeRates(null, { percent: '4' })).toEqual(rates(4, 0, 0));
    expect(resolvePlatformFeeRates(null)).toEqual(SERVER_DEFAULTS);
  });

  it('has NO env fallback for the flat component or the floor', () => {
    // The client preview cannot read Deno secrets, so an env flat would be
    // charged by the server and shown by nobody (MYK9-197 review, S5). An
    // unreadable row must land on the same 0/0 the preview falls back to.
    const unreadable = resolvePlatformFeeRates(null, { percent: '7' });
    expect(unreadable.flatCents).toBe(0);
    expect(unreadable.minCents).toBe(0);
    expect({ flatCents: unreadable.flatCents, minCents: unreadable.minCents }).toEqual({
      flatCents: CLIENT_DEFAULTS.flatCents,
      minCents: CLIENT_DEFAULTS.minCents,
    });
  });

  it('round-trips the charged rates through Stripe metadata', () => {
    for (const r of [rates(7), rates(7, 30), rates(0, 30, 100), rates(12.5, 99, 2000)]) {
      const stamped = stampPlatformFeeRates(r);
      expect(decodeStampedPlatformFeeRates(stamped, undefined)).toEqual(serverNormalize(r));
    }
  });

  it('reads an UNSTAMPED flat/floor as 0, never from env or the live row', () => {
    // A session created before the flat component existed carries only
    // platform_fee_percent. It was charged percentage-only, so re-validating it
    // against a live non-zero flat would reject a correctly charged payment and
    // leave the exhibitor paid with no entries.
    const legacy = { platform_fee_percent: '7' };
    expect(decodeStampedPlatformFeeRates(legacy, '7')).toEqual(rates(7, 0, 0));
    expect(serverFee(2500, decodeStampedPlatformFeeRates(legacy, '7'))).toBe(175);
    // Absent metadata entirely: the percent keeps its historical env fallback.
    expect(decodeStampedPlatformFeeRates(undefined, '3')).toEqual(rates(3, 0, 0));
    expect(decodeStampedPlatformFeeRates(undefined, undefined)).toEqual(SERVER_DEFAULTS);
  });
});

describe('formatPlatformFeeLabel describes every component that is on', () => {
  it('names the percent alone when flat and floor are off', () => {
    expect(formatPlatformFeeLabel(rates(7))).toBe('7%');
    expect(formatPlatformFeeLabel(rates(10.5))).toBe('10.5%');
  });

  it('names the flat component so "7%" stops being a false description', () => {
    expect(formatPlatformFeeLabel(rates(7, 30))).toBe('7% + $0.30');
    expect(formatPlatformFeeLabel(rates(0, 30))).toBe('$0.30');
  });

  it('names the floor', () => {
    expect(formatPlatformFeeLabel(rates(7, 0, 100))).toBe('7%, $1.00 minimum');
    expect(formatPlatformFeeLabel(rates(7, 30, 100))).toBe('7% + $0.30, $1.00 minimum');
  });

  it('falls back to 0% when nothing is charged', () => {
    expect(formatPlatformFeeLabel(rates(0))).toBe('0%');
  });
});
