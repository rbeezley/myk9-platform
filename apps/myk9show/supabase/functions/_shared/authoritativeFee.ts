// Pure server-side mirror of the client's getShowEntryFee (Deno-free;
// colocated vitest). Round-14 P1: entry_cart_items.entry_fee_cents is
// CLIENT-WRITABLE (the owner-update RLS policy in migration 009 covers every
// column), so checkout must never trust it — a direct PostgREST update could
// lower the fee and buy a paid entry at any price. Checkout recomputes each
// item's fee from this authority chain and refuses to charge anything else.
//
// Priority (mirrors PaymentStep/utils.ts getShowEntryFee):
//   1. Show-level fee, date-tiered: day-of-show fee once the show has
//      started, else pre-entry fee.
//   2. Class-level entry_fee (explicit 0 respected — free classes exist).
//   3. $25 default.
// Dates compare as calendar days in UTC; the client compares in local time,
// so a user right at the tier boundary may see the server pick the (higher)
// day-of fee — conservative in the platform's favor, never the reverse.

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

const DEFAULT_ENTRY_FEE_DOLLARS = 25;

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

  if (input.showStartDate) {
    const startDay = input.showStartDate.slice(0, 10);
    const nowDay = input.nowIso.slice(0, 10);
    if (nowDay >= startDay && day != null) {
      return Math.round(day * 100);
    }
  }
  if (pre != null) {
    return Math.round(pre * 100);
  }
  const classFee = parseDollars(input.classEntryFee);
  return Math.round((classFee ?? DEFAULT_ENTRY_FEE_DOLLARS) * 100);
}
