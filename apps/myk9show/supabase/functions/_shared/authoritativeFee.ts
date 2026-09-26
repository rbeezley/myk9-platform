// Pure server-side mirror of the client's getShowEntryFee (Deno-free;
// colocated vitest). Round-14 P1: entry_cart_items.entry_fee_cents is
// CLIENT-WRITABLE (the owner-update RLS policy in migration 009 covers every
// column), so checkout must never trust it — a direct PostgREST update could
// lower the fee and buy a paid entry at any price. Checkout recomputes each
// item's fee from this authority chain and refuses to charge anything else.
//
// Priority (mirrors PaymentStep/utils.ts getShowEntryFee):
//   0. MYK9-662: a configured junior handler fee, when the entry's handler is
//      a junior at this trial — see deriveJuniorStatusKind below. REPLACES the
//      tier-selected fee entirely (one flat rate, not a further discount off
//      the day-of tier), same as submit_show_entries.
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
  /**
   * MYK9-662: shows.junior_handler_fee — DECIMAL dollars, or null/undefined
   * when the show has no junior tier configured. NULL or 0 both mean "unset",
   * mirroring showDayOfShowFee's own convention (a blank fee-section input
   * persists as 0.00, not NULL).
   */
  showJuniorHandlerFee?: number | string | null;
  /** people.date_of_birth of this entry's handler, 'YYYY-MM-DD', or null when unknown. */
  handlerDateOfBirth?: string | null;
  /** trials.registry_id for this entry's trial ('AKC' | 'UKC' | 'ASCA'), or null. */
  trialRegistryId?: string | null;
  /** trials.date for this entry's trial, 'YYYY-MM-DD', or null. */
  trialDate?: string | null;
}

const DEFAULT_ENTRY_FEE_DOLLARS = 25;

function parseDollars(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[$,]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/** `YYYY-MM-DD` only (the leading slice tolerates a full ISO timestamp). */
function parseCalendarDate(value: string | null | undefined): CalendarDate | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return { year, month, day };
}

/** Completed years from `birth` to `on`, by calendar comparison (no `Date` math). */
function completedYearsBetween(birth: CalendarDate, on: CalendarDate): number {
  let years = on.year - birth.year;
  const hadBirthday = on.month > birth.month || (on.month === birth.month && on.day >= birth.day);
  if (!hadBirthday) years -= 1;
  return years;
}

type JuniorStatusKind = 'junior' | 'adult' | 'unknown';

/**
 * MYK9-662: server-side (Deno) mirror of `deriveJuniorStatus()` in
 * apps/myk9show/src/features/registries/juniorHandlerPolicy.ts — kind only
 * (junior/adult/unknown), since pricing never needs the age or the rulebook
 * citation. Edge functions cannot import apps/myk9show/src (a separate deploy
 * tree), so this restates the three-registry rule, same as
 * derive_junior_status does in SQL for submit_show_entries. Change one,
 * change both of the others.
 *
 *  - AKC:  under 18 on the day of the trial.
 *  - UKC:  under 18 as of January 1 of the competition year (a fixed date,
 *          not the trial date).
 *  - ASCA: states a floor of 8 and no ceiling — not derivable. 'unknown',
 *          same as a missing date of birth or an unrecognized registry.
 *          'unknown' never buys the discount.
 */
function deriveJuniorStatusKind(
  dateOfBirth: string | null | undefined,
  trialDate: string | null | undefined,
  registryId: string | null | undefined
): JuniorStatusKind {
  const birth = parseCalendarDate(dateOfBirth);
  const trial = parseCalendarDate(trialDate);
  if (!birth || !trial) return 'unknown';
  if (registryId !== 'AKC' && registryId !== 'UKC') return 'unknown';

  const measureOn: CalendarDate =
    registryId === 'UKC' ? { year: trial.year, month: 1, day: 1 } : trial;
  const age = completedYearsBetween(birth, measureOn);

  // A date of birth after the measuring date is bad data, not a very young
  // handler (mirrors juniorHandlerPolicy.ts's `age < 0` guard).
  if (age < 0) return 'unknown';

  return age < 18 ? 'junior' : 'adult';
}

export function authoritativeEntryFeeCents(input: AuthoritativeFeeInput): number {
  const pre = parseDollars(input.showPreEntryFee);
  const day = parseDollars(input.showDayOfShowFee);
  const junior = parseDollars(input.showJuniorHandlerFee);

  if (junior != null && junior > 0) {
    const kind = deriveJuniorStatusKind(
      input.handlerDateOfBirth,
      input.trialDate,
      input.trialRegistryId
    );
    if (kind === 'junior') {
      return Math.round(junior * 100);
    }
  }

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
