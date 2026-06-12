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
}

const DEFAULT_ENTRY_FEE_DOLLARS = 25;

function parseDollars(value: number | string | null): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[$,]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function authoritativeEntryFeeCents(input: AuthoritativeFeeInput): number {
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
