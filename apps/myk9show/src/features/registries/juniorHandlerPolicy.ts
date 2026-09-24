/**
 * MYK9-570 slice 1: is the handler a junior, and under whose rule?
 *
 * Owner decision (Richard, 2026-09-18, on the issue): junior is DERIVED from the
 * handler's date of birth and the trial date, never a hand-set flag — a flag set in
 * March is wrong by September, and the three registries do not even agree on which
 * day to measure. Nothing here touches money; the per-show junior fee is slice 2.
 *
 * The rules, read out of `docs/rulebooks/*.txt` and quoted so a later reader does not
 * have to re-derive them:
 *
 *  - **AKC Scent Work** — junior is "less than 18 years of age on the day of the trial"
 *    (glossary entry "Junior Handler", akc-scent-work-regulations.txt line 2762, which
 *    itself cross-references pp. 11-12 and 13). Ch.3 §10 — line 444, the p.13 text —
 *    repeats it as "on the day of the event". No minimum age. AKC issues an
 *    **AKC Junior Handler number**; the
 *    glossary is explicit that a junior "need not have" one to compete, but earns no
 *    award credit without one held *prior to the date of the trial*. So the number is
 *    worth printing and must never gate the derived status.
 *  - **UKC Nosework** — Ch.1 §3 (ukc-nose-work-rules.txt lines 224-230): "Handlers under
 *    the age of 18 may compete as a Junior Handler", but the measuring instant is a
 *    FIXED date, not the trial. A handler who turns 18 in March is therefore still a
 *    junior at a November trial.
 *
 *    §3 states the rule TWICE and the two disagree at exactly one date. Rule A (line
 *    225): a junior "may not have reached their eighteenth birthday as of January 1st of
 *    the competition year". Rule B (line 226): they stop after "December 31st of the year
 *    in which the junior turns 18". For a handler whose eighteenth birthday IS January 1,
 *    rule A says adult for the whole year and rule B says junior for the whole year.
 *    This module takes **rule A**, the stricter one, because the cost of the two errors
 *    is not symmetric: wrongly marking someone a junior is a false eligibility claim on
 *    registry paperwork, while wrongly omitting the mark prints a plain, correct name.
 *    Every other date is unaffected — the two rules agree everywhere else.
 *    UKC issues no number — the "UKC Junior program" is an optional membership that
 *    gates awards, not entry — but the UKC change-entry form has a "Junior ID" slot, so
 *    the person may still carry a UKC value.
 *  - **ASCA Scent Detection** — §17 "Junior Handlers" (p.36) sets a FLOOR only:
 *    "Minimum age requirement for handlers is eight (8) years of age", and juniors
 *    "compete with and in the same classes as adults". The rulebook states no upper age
 *    bound anywhere (grepped for "under 18" / "18 years" / "eighteen" / "youth": zero
 *    hits) and no measuring date. ASCA therefore has NO derivable junior status, and
 *    this module invents none — `deriveJuniorStatus` returns 'unknown' for ASCA with a
 *    ruleSource that says why. §17 also states a FLOOR ("Minimum age requirement for
 *    handlers is eight (8) years of age", asca-scent-detection-rules.txt line 2711).
 *    That is recorded here in prose and nowhere in the data, deliberately: it is a
 *    rule about who may ENTER, no caller in this app decides entry eligibility by
 *    registry, and a field no one reads is dead weight that acquires a wrong comment
 *    (it did — round 2). Whoever needs it should read this paragraph and add the
 *    field back with its consumer in the same change.
 *
 * Deliberately NOT here: any fee, discount or price. See MYK9-570 slice 2.
 */
import type { RegistryId } from './types';

/**
 * What the registry's rulebook says about junior handlers.
 *
 * Both bounds are nullable because no registry states both: AKC and UKC give a ceiling
 * and no floor, ASCA gives a floor and no ceiling. A single `{min, max}` with non-null
 * defaults would have invented a rule at whichever end the rulebook is silent.
 */
export interface RegistryJuniorHandlerRule {
  registryId: RegistryId;
  /** Exclusive upper bound in years, or null when the rulebook states none. */
  maxAgeYearsExclusive: number | null;
  /**
   * The instant the handler's age is measured at.
   *  - 'trial-date' — the day of the trial (AKC).
   *  - 'january-1-of-trial-year' — January 1 of the competition year (UKC).
   */
  ageMeasuredOn: 'trial-date' | 'january-1-of-trial-year';
  /** True when the registry issues a junior handler number worth storing and printing. */
  issuesJuniorHandlerNumber: boolean;
  /**
   * What the registry calls that number on its own paperwork, or null when it
   * issues none. The UI uses the registry's words, not ours — AKC prints
   * "Junior Handler Number", UKC's change-entry form says "Junior ID".
   */
  juniorHandlerNumberLabel: string | null;
  /** Human-readable citation, printed in `ruleSource` and shown to nobody in the UI. */
  citation: string;
}

const AKC_RULE: RegistryJuniorHandlerRule = {
  registryId: 'AKC',
  maxAgeYearsExclusive: 18,
  ageMeasuredOn: 'trial-date',
  issuesJuniorHandlerNumber: true,
  juniorHandlerNumberLabel: 'AKC junior handler number',
  citation:
    'AKC Scent Work Regulations, glossary "Junior Handler" (pp. 11-12, 13) and Ch.3 §10: less than 18 years of age on the day of the trial.',
};

const UKC_RULE: RegistryJuniorHandlerRule = {
  registryId: 'UKC',
  maxAgeYearsExclusive: 18,
  ageMeasuredOn: 'january-1-of-trial-year',
  // UKC runs a Junior program membership rather than issuing a number, but its
  // change-entry form carries a "Junior ID" slot, so a stored value has somewhere to go.
  issuesJuniorHandlerNumber: true,
  juniorHandlerNumberLabel: 'UKC junior ID',
  citation:
    'UKC Nosework Rules, Ch.1 §3 "Eligibility of Owners/Handlers": may not have reached their eighteenth birthday as of January 1st of the competition year.',
};

/**
 * ASCA states a floor and no ceiling, so junior status is NOT derivable. Modelled
 * explicitly rather than omitted so that `getJuniorHandlerRule('ASCA')` has an answer
 * and the reason travels with it, in `citation`.
 */
const ASCA_RULE: RegistryJuniorHandlerRule = {
  registryId: 'ASCA',
  maxAgeYearsExclusive: null,
  ageMeasuredOn: 'trial-date',
  issuesJuniorHandlerNumber: false,
  juniorHandlerNumberLabel: null,
  citation:
    'ASCA Scent Detection Rules §17 "Junior Handlers" (p.36): minimum handler age eight (8); the rulebook states no upper age bound, so junior status cannot be derived.',
};

const RULES: Readonly<Record<RegistryId, RegistryJuniorHandlerRule>> = {
  AKC: AKC_RULE,
  UKC: UKC_RULE,
  ASCA: ASCA_RULE,
};

/** The junior handler rule for a registry. Throws for an id with no config. */
export function getJuniorHandlerRule(registryId: RegistryId): RegistryJuniorHandlerRule {
  const rule = RULES[registryId];
  if (!rule) throw new Error(`Registry "${registryId}" has no junior handler rule configured`);
  return rule;
}

/**
 * The three answers.
 *
 *  - 'junior'   — inside the registry's junior band on the measuring date.
 *  - 'adult'    — outside it, for a registry that HAS an upper bound.
 *  - 'unknown'  — no date of birth, an unparseable date, a date of birth after the
 *                 trial, a handler whose identity does not match the printed name,
 *                 or a registry whose rulebook states no upper bound (ASCA).
 *                 Never printed as either "Jr." or "adult"; the caller shows nothing.
 *
 * There is deliberately no 'ineligible': ASCA's stated FLOOR of 8 is a rule about
 * who may enter, not about who is a junior, and no surface here decides entry
 * eligibility by registry. A kind no caller consumes is a dead branch — and so is
 * a field, which is why the floor lives in this module's header prose rather than
 * in the rule table (rounds 1 and 2 of the review, in that order).
 */
export type JuniorStatusKind = 'junior' | 'adult' | 'unknown';

export interface JuniorStatus {
  kind: JuniorStatusKind;
  /**
   * Completed years at the registry's measuring instant, or undefined when it could not
   * be computed. Present for 'unknown' when the DOB parsed but the registry has no rule,
   * so a secretary surface could still show the age if it ever wants to.
   */
  ageOnTrialDate?: number;
  /** Why this answer — the rulebook citation, or the reason no rule applied. */
  ruleSource: string;
}

export interface DeriveJuniorStatusInput {
  /** `people.date_of_birth` as an ISO `YYYY-MM-DD` date, or null/undefined when unknown. */
  dateOfBirth: string | null | undefined;
  /** The trial's date as an ISO `YYYY-MM-DD` date. */
  trialDate: string | null | undefined;
  registryId: RegistryId;
}

/** `YYYY-MM-DD` only. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/**
 * Parse a calendar date WITHOUT constructing a `Date`.
 *
 * `new Date('2008-09-18')` is UTC midnight, and every comparison against a locally
 * constructed date is then off by the viewer's offset — which is exactly the class of
 * bug that turns a birthday-on-the-trial-date case into yesterday's answer for anyone
 * west of Greenwich. Junior status is a calendar question, so it is answered on calendar
 * fields only. Also rejects a well-formed but impossible date (2008-02-31).
 */
function parseCalendarDate(value: string | null | undefined): CalendarDate | null {
  if (!value) return null;
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return { year, month, day };
}

/**
 * Completed years from `birth` to `on`, by calendar comparison. Negative is impossible
 * for real data but is returned as-is so callers can see a bad date of birth rather than
 * having it clamped to 0 — a clamp would read as "newborn", which is a plausible age.
 */
export function completedYearsBetween(birth: CalendarDate, on: CalendarDate): number {
  let years = on.year - birth.year;
  const hadBirthday = on.month > birth.month || (on.month === birth.month && on.day >= birth.day);
  if (!hadBirthday) years -= 1;
  return years;
}

/**
 * Derive whether the handler is a junior at a given trial, under a given registry.
 *
 * Pure and synchronous — no `Date.now()`, no timezone, no I/O. The trial date is always
 * supplied by the caller so that reprinting a catalog for last year's trial gives last
 * year's answer.
 */
export function deriveJuniorStatus({
  dateOfBirth,
  trialDate,
  registryId,
}: DeriveJuniorStatusInput): JuniorStatus {
  const rule = getJuniorHandlerRule(registryId);

  const birth = parseCalendarDate(dateOfBirth);
  if (!birth) {
    return {
      kind: 'unknown',
      ruleSource: 'No date of birth on the handler, so junior status cannot be derived.',
    };
  }

  const trial = parseCalendarDate(trialDate);
  if (!trial) {
    return {
      kind: 'unknown',
      ruleSource: 'No trial date, so the handler’s age cannot be measured.',
    };
  }

  // UKC measures on January 1 of the competition year, not the day of the trial.
  const measureOn: CalendarDate =
    rule.ageMeasuredOn === 'january-1-of-trial-year'
      ? { year: trial.year, month: 1, day: 1 }
      : trial;

  const age = completedYearsBetween(birth, measureOn);

  // A date of birth AFTER the measuring date is bad data, not a very young handler.
  // Left unguarded it is the worst possible failure: a negative age is less than every
  // registry's ceiling, so a typo'd future date of birth would print "Jr." on an adult's
  // catalog line and their junior number on an entry form. Both edit surfaces and the
  // column's CHECK reject it; this is the third line of defence.
  if (age < 0) {
    return {
      kind: 'unknown',
      ruleSource:
        'The date of birth is after the trial date, so it cannot be right; junior status is not derived.',
    };
  }

  if (rule.maxAgeYearsExclusive === null) {
    return {
      kind: 'unknown',
      ageOnTrialDate: age,
      ruleSource: rule.citation,
    };
  }

  return {
    kind: age < rule.maxAgeYearsExclusive ? 'junior' : 'adult',
    ageOnTrialDate: age,
    ruleSource: rule.citation,
  };
}

/**
 * The registry-issued junior handler number for a person, or null.
 *
 * Reads `people.junior_handler_numbers`, whose keys are pinned to `RegistryId` by a CHECK
 * in migration 20260918154700. Tolerates the raw jsonb shape (`unknown`) because the
 * column arrives off PostgREST as `Json`, and a blank string is treated as absent so a
 * cleared input never prints an empty box on a form.
 */
export function getJuniorHandlerNumber(
  juniorHandlerNumbers: unknown,
  registryId: RegistryId
): string | null {
  if (!juniorHandlerNumbers || typeof juniorHandlerNumbers !== 'object') return null;
  if (Array.isArray(juniorHandlerNumbers)) return null;
  const value = (juniorHandlerNumbers as Record<string, unknown>)[registryId];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Narrow the raw `people.junior_handler_numbers` jsonb to a string map.
 *
 * Every read path that maps a person goes through this, so a malformed column
 * (hand-edited row, older client) degrades to "no numbers" instead of putting a
 * number-shaped object into `User.juniorHandlerNumbers`. Returns undefined when
 * there is nothing to carry, so a `Partial<User>` update never writes `{}` over
 * an existing value by accident.
 */
export function normalizeJuniorHandlerNumbers(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const registryId of Object.keys(RULES) as RegistryId[]) {
    const value = getJuniorHandlerNumber(raw, registryId);
    if (value !== null) out[registryId] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * The map to STORE, given whatever the form is holding.
 *
 * Trims, drops blanks, and — the point — keeps every key in the registry set,
 * not just the ones the form renders an input for. Rebuilding the map from the
 * two rendered inputs deleted a stored ASCA value on every unrelated save.
 * Returns `{}` rather than undefined because the column is NOT NULL DEFAULT '{}'.
 */
export function juniorHandlerNumbersForSave(
  numbers: Partial<Record<RegistryId, string>> | null | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const registryId of Object.keys(RULES) as RegistryId[]) {
    const trimmed = numbers?.[registryId]?.trim();
    if (trimmed) out[registryId] = trimmed;
  }
  return out;
}

/**
 * MYK9-664: the numbers as a MERGE patch for `update_person_details()`,
 * which sets each present key and removes a key whose value is blank.
 *
 *  - `clearBlanks: true` — the caller can see what is stored (the person's own
 *    profile), so every registry key is sent and a blank input clears it.
 *  - `clearBlanks: false` — the caller cannot (a show manager's write-only
 *    form), so only filled inputs are sent and a blank leaves the stored number
 *    alone. Returns undefined when there is nothing to send.
 */
export function juniorHandlerNumbersPatch(
  numbers: Partial<Record<RegistryId, string>> | null | undefined,
  { clearBlanks }: { clearBlanks: boolean }
): Record<string, string> | undefined {
  if (!clearBlanks) {
    const filled = juniorHandlerNumbersForSave(numbers);
    return Object.keys(filled).length > 0 ? filled : undefined;
  }
  const out: Record<string, string> = {};
  for (const registryId of Object.keys(RULES) as RegistryId[]) {
    out[registryId] = numbers?.[registryId]?.trim() ?? '';
  }
  return out;
}

/** The registries the app offers a junior handler number input for. */
export function registriesIssuingJuniorHandlerNumbers(): readonly RegistryId[] {
  return (Object.keys(RULES) as RegistryId[]).filter(id => RULES[id].issuesJuniorHandlerNumber);
}
