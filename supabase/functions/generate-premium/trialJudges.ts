/**
 * MYK9-2056 / MYK9-2067: a trial's judges as the premium prints them, "Name, City, ST" with the
 * classes each one judges (AKC Ch. 3 §15: judges' names, cities of residence, assignments).
 *
 * `judge_assignments` holds one row per judge per class, so a judge on two classes came out of
 * the generator twice, with no city and no classes. This folds the rows to one entry per judge.
 * The label and residence formats match the app's `formatPremiumClassLabel` and
 * `formatJudgeResidence`, which this Deno function cannot import.
 */

/** The `judge_assignments` select nested under a trial: the class and the judge's printable facts. */
export const PREMIUM_TRIAL_JUDGES_SELECT =
  'class_id, people(id, first_name, last_name, city, state)';

export interface PremiumTrialJudgeRow {
  class_id: string | null;
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
 * One entry per judge, in the order first assigned. Classes follow the trial's class order, each
 * once. A trial-level row (no class) means the judge takes every class, so that judge lists none:
 * the renderer then prints the name and residence alone. A class not on this trial is skipped.
 */
export function premiumTrialJudges(
  rows: ReadonlyArray<PremiumTrialJudgeRow> | null | undefined,
  trialClasses: ReadonlyArray<PremiumTrialClassRow> | null | undefined
): PremiumTrialJudge[] {
  const classOrder = new Map((trialClasses ?? []).map((cls, index) => [cls.id, index]));
  const classById = new Map((trialClasses ?? []).map(cls => [cls.id, cls]));
  const byPerson = new Map<
    string,
    { name: string; residence: string | null; classIds: Set<string>; wholeTrial: boolean }
  >();

  for (const row of rows ?? []) {
    const person = row.people;
    if (!person) continue;
    const name = `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim();
    if (!name) continue;
    const entry = byPerson.get(person.id) ?? {
      name,
      residence: formatResidence(person.city, person.state),
      classIds: new Set<string>(),
      wholeTrial: false,
    };
    if (row.class_id === null) entry.wholeTrial = true;
    else if (classById.has(row.class_id)) entry.classIds.add(row.class_id);
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
