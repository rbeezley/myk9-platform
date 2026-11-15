// Pure server-side mirror of the client's getShowEntryFee (Deno-free;
// colocated vitest). Round-14 P1: entry_cart_items.entry_fee_cents is
// CLIENT-WRITABLE (the owner-update RLS policy in migration 009 covers every
// column), so checkout must never trust it — a direct PostgREST update could
// lower the fee and buy a paid entry at any price. Checkout recomputes each
// item's fee from this authority chain and refuses to charge anything else.
//
// Priority (mirrors PaymentStep/utils.ts getShowEntryFee and
// private.price_entry_fee; MYK9-1931):
//   1. The class's own entry_fee when it is above 0. Once the show has started
//      the show's day-of surcharge (day-of fee minus pre-entry fee, when above
//      it) is added. 0 or none means "charge the show's fee".
//   2. Show-level fee, date-tiered: day-of-show fee once the show has
//      started, else pre-entry fee.
//   3. Otherwise $0, exactly as private.price_entry_fee's COALESCE(..., 0): a
//      show with no pre-entry fee and a class with no fee of its own (NULL or 0)
//      is free. The server prices the entry, so checkout must not invent a fee.
// "Has the show started" compares calendar days in the SHOW's time zone (owner
// decision 2026-10-15, MYK9-1198): the fee switches at midnight where the show
// is held, the same for every exhibitor, as `submit_show_entries` decides it.
// `shows.start_date` is a timestamptz at midnight UTC, so its first ten
// characters are the show's calendar day. The zone comes from the show's first
// trial (`showTimeZoneFromTrials`); missing or invalid is America/New_York.

import { calendarDateInTimeZone, resolveShowTimeZone } from './showTimeZone.ts';

export interface AuthoritativeFeeInput {
  /** shows.pre_entry_fee — DECIMAL dollars (number or numeric string) */
  showPreEntryFee: number | string | null;
  /** shows.day_of_show_fee — DECIMAL dollars */
  showDayOfShowFee: number | string | null;
  /** shows.start_date — 'YYYY-MM-DD' (or full ISO) */
  showStartDate: string | null;
  /** classes.entry_fee — DECIMAL dollars */
  classEntryFee: number | string | null;
  /** evaluation clock, ISO — injected so the function stays pure/testable */
  nowIso: string;
  /**
   * IANA zone of the show (its first trial's, `showTimeZoneFromTrials`). The
   * day-of tier starts at midnight here. Missing or invalid = America/New_York.
   */
  showTimeZone?: string | null | undefined;
  /** shows.junior_handler_fee — DECIMAL dollars. NULL or 0 = no junior tier. */
  showJuniorHandlerFee?: number | string | null | undefined;
  /**
   * The junior-handler declaration (MYK9-879): the exhibitor said the person
   * showing the dog is under 18, or the stored entry records that the junior fee
   * was already charged. Never derived from a date of birth or from who owns the
   * dog. Honored only on a show with a junior tier.
   */
  juniorDeclared?: boolean | undefined;
  /**
   * shows.organization. ASCA has no junior tier (junior status cannot be
   * derived there and the setting is hidden), so a declaration is honored on no
   * ASCA show, whatever fee a stale row carries.
   */
  showOrganization?: string | null | undefined;
}

function parseDollars(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[$,]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function authoritativeEntryFeeCents(input: AuthoritativeFeeInput): number {
  const normalCents = normalEntryFeeCents(input);
  if (!input.juniorDeclared || input.showOrganization === 'ASCA') return normalCents;
  const junior = parseDollars(input.showJuniorHandlerFee);
  // NULL or 0 is no junior tier (slice A's convention). LEAST: the same rule as
  // private.price_entry_fee and the client's getShowEntryFee, so a junior tier
  // set above the regular fee never charges more than the regular fee.
  if (junior == null || junior <= 0) return normalCents;
  return Math.min(Math.round(junior * 100), normalCents);
}

function normalEntryFeeCents(input: AuthoritativeFeeInput): number {
  const pre = parseDollars(input.showPreEntryFee);
  const day = parseDollars(input.showDayOfShowFee);
  const classFee = parseDollars(input.classEntryFee);
  const ownFee = classFee != null && classFee > 0 ? classFee : null;

  let dayOfTier = false;
  if (input.showStartDate) {
    const startDay = input.showStartDate.slice(0, 10);
    const nowDay = calendarDateInTimeZone(
      new Date(input.nowIso),
      resolveShowTimeZone(input.showTimeZone)
    );
    // A day-of fee of 0 or NULL is "no day-of tier" (a blank one is stored as 0.00), never a
    // $0 price: the same rule as private.price_entry_fee and getShowEntryFee (MYK9-1931).
    dayOfTier = nowDay >= startDay && day != null && day > 0;
  }

  // MYK9-1931: a class's own fee wins; on the day it carries the show's surcharge.
  if (ownFee != null) {
    const surchargeCents =
      dayOfTier && day != null && pre != null && day > pre
        ? Math.round(day * 100) - Math.round(pre * 100)
        : 0;
    return Math.round(ownFee * 100) + surchargeCents;
  }
  if (dayOfTier && day != null) {
    return Math.round(day * 100);
  }
  if (pre != null) {
    return Math.round(pre * 100);
  }
  return 0;
}
