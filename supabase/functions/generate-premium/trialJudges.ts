/**
 * MYK9-2056 / MYK9-2067: a trial's judges as the premium prints them, "Name, City, ST" with the
 * classes each one judges (AKC Ch. 3 §15: judges' names, cities of residence, assignments).
 *
 * `judge_assignments` holds one row per judge per class, so a judge on two classes came out of
 * the generator twice, with no city and no classes. The rows are read once for the whole show
 * and matched to a trial through their class, never `trial_id`: `set_class_judge` writes
 * class-level rows with `trial_id` NULL, and a nested `trials(judge_assignments(...))` embed
 * silently drops them. The label and residence formats match the app's `formatPremiumClassLabel`
 * and `formatJudgeResidence`, which this Deno function cannot import.
 */

/** The show-wide `judge_assignments` select: where the row applies and the judge's printable facts. */
export const PREMIUM_JUDGE_ASSIGNMENTS_SELECT =
  'trial_id, class_id, status, people!judge_assignments_person_id_fkey(id, first_name, last_name, city, state)';

/** Statuses that keep a judge off the premium, as `generate-trial-packet` treats them. */
const INACTIVE_STATUSES = new Set(['declined', 'cancelled']);

export interface PremiumJudgeAssignmentRow {
  trial_id: string | null;
  class_id: string | null;
  status?: string | null;
  people: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    city?: string | null;
    state?: string | null;
  } | null;
}

export interface PremiumTrialClassRow {
  id: string;
  element: string | null;
  level: string | null;
  section: string | null;
  deleted_at?: string | null;
}

export interface PremiumTrialJudge {
  name: string;
  residence: string | null;
  classes: string[];
}

/** "City, ST"; the city alone without a state; null without a city (a bare state reads as a typo). */
export function formatResidence(
  city: string | null | undefined,
  state: string | null | undefined
): string | null {
  const place = city?.trim();
  if (!place) return null;
  const region = state?.trim();
  return region ? `${place}, ${region}` : place;
}

/** "Element Level Section", the one label a premium prints for a class. */
export function formatClassLabel(cls: PremiumTrialClassRow): string | null {
  if (!cls.element || !cls.level) return null;
  return `${cls.element} ${cls.level}${cls.section ? ` ${cls.section}` : ''}`;
}

/**
 * The judges of one trial, one entry each, in the order the rows come (the caller orders them by
 * `created_at`). A row applies to this trial when its class is one of the trial's live classes.
 * A row with no class covers every class of its trial, or of every trial when it has no trial
 * either (a whole-show judge); that judge lists no classes, so the renderer prints the name and
 * residence alone. Declined and cancelled assignments, and deleted classes, print nothing.
 */
export function premiumTrialJudges(
  rows: ReadonlyArray<PremiumJudgeAssignmentRow> | null | undefined,
  trial: { id: string; classes: ReadonlyArray<PremiumTrialClassRow> | null | undefined }
): PremiumTrialJudge[] {
  const liveClasses = (trial.classes ?? []).filter(cls => !cls.deleted_at);
  const classOrder = new Map(liveClasses.map((cls, index) => [cls.id, index]));
  const classById = new Map(liveClasses.map(cls => [cls.id, cls]));
  const byPerson = new Map<
    string,
    { name: string; residence: string | null; classIds: Set<string>; wholeTrial: boolean }
  >();

  for (const row of rows ?? []) {
    const person = row.people;
    if (!person || INACTIVE_STATUSES.has(row.status ?? '')) continue;
    const wholeTrial =
      row.class_id === null && (row.trial_id === null || row.trial_id === trial.id);
    const classHere = row.class_id !== null && classById.has(row.class_id);
    if (!wholeTrial && !classHere) continue;
    const name = `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim();
    if (!name) continue;
    const entry = byPerson.get(person.id) ?? {
      name,
      residence: formatResidence(person.city, person.state),
      classIds: new Set<string>(),
      wholeTrial: false,
    };
    if (wholeTrial) entry.wholeTrial = true;
    else entry.classIds.add(row.class_id!);
    byPerson.set(person.id, entry);
  }

  return [...byPerson.values()].map(entry => {
    const labels = entry.wholeTrial
      ? []
      : [...entry.classIds]
          .sort((a, b) => (classOrder.get(a) ?? 0) - (classOrder.get(b) ?? 0))
          .map(id => formatClassLabel(classById.get(id)!))
          .filter((label): label is string => label !== null);
    return { name: entry.name, residence: entry.residence, classes: [...new Set(labels)] };
  });
}
