/**
 * Why a class chip is full, and what the exhibitor can do instead.
 *
 * MYK9-515. A full chip rendered a red "Full" badge and a disabled checkbox and
 * nothing else. The exhibitor was not told whether "full" meant the class, the
 * judge's day or the trial; whether a wait list existed; or what to do next. A
 * disabled control with no explanation is the affordance INTENT.md's exhibitor
 * section exists to prevent.
 *
 * Every input here comes from the availability payload the SERVER computed
 * (`useClassAvailability`, which mirrors the fullness inputs the submit RPC
 * uses). Nothing is recounted client-side: MYK9-173/226 are the record of what
 * happens when the client makes a money claim from its own arithmetic, and a
 * sentence naming a spot that does not exist is exactly such a claim. Even the
 * "is the whole trial full?" question is answered by folding the server's own
 * per-class `isFull` verdicts, never by counting entries.
 */

/** The availability fields this module reads. A subset of `ClassAvailability`. */
export interface FullReasonClass {
  classId: string;
  /**
   * The class's stored name. Load-bearing, not decorative: a show can run two
   * classes that share an element AND a level and differ only here — the seeded
   * Heartland trial runs both "Interior Advanced" and "Interior Advanced
   * Preliminary" (MYK9-489). Matching an alternative on element + level alone
   * would send an exhibitor turned away from Advanced to Preliminary and call it
   * the same class: MYK9-489's defect wearing this module's clothes.
   */
  className?: string | null | undefined;
  element: string | null;
  level: string;
  trialId: string;
  trialDate: string;
  entryLimit: number;
  currentEntries: number;
  isFull: boolean;
  allowsWaitlist: boolean;
  judgeDayFull: boolean;
}

export interface FullReasonInput {
  /** The class whose chip is full. */
  classId: string;
  /** Every availability row for the show, as the server returned them. */
  availability: readonly FullReasonClass[];
  /** Secretary/club contact from the show record, when the show carries one. */
  secretaryContact?: string | null | undefined;
}

/**
 * Weekday for a `YYYY-MM-DD` trial date.
 *
 * Parsed as a LOCAL date (`T00:00:00`), never `new Date('2026-10-25')`, which
 * JS reads as UTC midnight and renders as the previous day for every exhibitor
 * west of Greenwich — "Saturday's class has space" pointing at Sunday's class
 * is worse than saying nothing.
 */
function weekday(date: string | null | undefined): string | null {
  if (!date) return null;
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { weekday: 'long' });
}

function sameLabel(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

/**
 * What ran out. Class limit first: when a class has its own `max_entries` and
 * has reached it, that is the specific, actionable fact, and reporting the
 * judge's day instead would send the exhibitor to a different day that is not
 * actually the constraint.
 */
function whatIsFull(target: FullReasonClass, availability: readonly FullReasonClass[]): string {
  const perClassFull = target.entryLimit > 0 && target.currentEntries >= target.entryLimit;
  if (perClassFull) return 'This class is full';

  const trialClasses = availability.filter(cls => cls.trialId === target.trialId);
  if (trialClasses.length > 1 && trialClasses.every(cls => cls.isFull)) {
    return 'Every class in this trial is full';
  }

  if (target.judgeDayFull) {
    const day = weekday(target.trialDate);
    return day ? `The judge's ${day} is full` : "The judge's day is full";
  }

  return 'This class is full';
}

/**
 * Whether two rows are the same class offered on two days.
 *
 * Element and level are the coarse test; the NAME settles it when a show runs
 * two classes sharing both (MYK9-489). Names are compared only when both rows
 * carry one — a source that never populated `name` must not silently switch the
 * suggestion off, and with no name to disagree about, element + level is the
 * best answer available.
 */
function isSameOffering(a: FullReasonClass, b: FullReasonClass): boolean {
  if (!sameLabel(a.element, b.element) || !sameLabel(a.level, b.level)) return false;
  const aName = (a.className ?? '').trim();
  const bName = (b.className ?? '').trim();
  if (!aName || !bName) return true;
  return sameLabel(aName, bName);
}

/**
 * The same class on a DIFFERENT day, still open. Same-day siblings are excluded
 * deliberately: an exhibitor who cannot get into Saturday's Interior Advanced is
 * being offered a real alternative only if it runs at another time they could
 * attend.
 */
function openAlternative(
  target: FullReasonClass,
  availability: readonly FullReasonClass[]
): FullReasonClass | null {
  return (
    availability.find(
      cls =>
        cls.classId !== target.classId &&
        !cls.isFull &&
        cls.trialDate !== target.trialDate &&
        isSameOffering(cls, target)
    ) ?? null
  );
}

function describeAlternative(alternative: FullReasonClass): string {
  const day = weekday(alternative.trialDate);
  // The class's own name first: it is what the exhibitor will look for on the
  // page, and the only spelling that survives two classes sharing an element
  // and a level.
  const name =
    (alternative.className ?? '').trim() ||
    [alternative.element, alternative.level].filter(Boolean).join(' ').trim();
  if (day && name) return `${day}'s ${name} still has space.`;
  if (day) return `${day}'s class still has space.`;
  return `Another day's ${name || 'class'} still has space.`;
}

/**
 * The one-line reason, or null when the class is not full (or has no server row
 * to reason from — an unreadable availability read must not produce a confident
 * sentence about capacity).
 */
export function buildFullChipReason(input: FullReasonInput): string | null {
  const { classId, availability, secretaryContact } = input;
  const target = availability.find(cls => cls.classId === classId);
  if (!target || !target.isFull) return null;

  const opening = whatIsFull(target, availability);
  const waitlist = target.allowsWaitlist ? ' — you can join the wait list.' : '.';

  const alternative = openAlternative(target, availability);
  if (alternative) return `${opening}${waitlist} ${describeAlternative(alternative)}`;

  if (target.allowsWaitlist) return `${opening}${waitlist}`;

  const contact = secretaryContact?.trim();
  return contact
    ? `${opening}. Contact the show secretary at ${contact}.`
    : `${opening}. Contact the show secretary.`;
}
