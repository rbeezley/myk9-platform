/**
 * One answer to "what uniquely names a class to an exhibitor?", shared by the
 * public show premium and the registration wizard.
 *
 * A show can run two classes that share an element AND a level. The seeded
 * Heartland Saturday trial runs both "Interior Advanced" and "Interior Advanced
 * Preliminary", neither with a section. Any label built from element + level +
 * section alone renders those identically, which cost the exhibitor twice:
 *
 *   - the premium listed one Interior Advanced class where the show offers two
 *     (MYK9-487, fixed in 4259a1eb9)
 *   - the wizard offered two adjacent chips both reading "Advanced", so
 *     choosing "the Advanced one" is a coin flip at $30 a class (MYK9-489)
 *
 * Both surfaces now derive the distinguishing words from the class NAME, here,
 * rather than each inventing a rule. They are the two screens the same person
 * reads minutes apart when deciding what to enter; separate rules would drift.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The words in a class's NAME that its element, level and section do not
 * already account for — "Preliminary" for "Interior Advanced Preliminary"
 * under element Interior, level Advanced.
 *
 * Returns '' when the name merely restates what the caller already renders,
 * which is the common case: "Interior Novice B" adds nothing to element
 * Interior + level Novice + section B. That emptiness is load-bearing. It is
 * what keeps split levels merged as "Novice A, B" on the premium instead of
 * splitting into two entries, and what keeps ordinary chips reading "Novice B"
 * rather than doubling their own words back at the reader.
 *
 * Each token is removed once and on a word boundary, so a level that appears
 * twice in a name keeps its second occurrence, and "Novice" does not match
 * inside a hypothetical "Novices".
 *
 * The boundary is applied per END, not blindly on both: `\b` asserts a
 * word/non-word transition, so anchoring a token that starts or ends with
 * punctuation would never match. An element genuinely named "C.A.T." ends in a
 * dot, and `\bC\.A\.T\.\b` cannot match "C.A.T. Open Trial" — the token would
 * survive into the label and re-create the ambiguity this rule exists to
 * remove. Element and level are free text from the database, so punctuation is
 * a real input, not a hypothetical one.
 */
export function classNameExtra(
  name: string | null | undefined,
  element: string | null | undefined,
  level: string | null | undefined,
  section: string | null | undefined
): string {
  const cleanedName = clean(name);
  if (!cleanedName) return '';

  let rest = cleanedName;
  for (const token of [clean(element), clean(level), clean(section)]) {
    if (!token) continue;
    const lead = /^\w/.test(token) ? '\\b' : '';
    const trail = /\w$/.test(token) ? '\\b' : '';
    rest = rest.replace(new RegExp(`${lead}${escapeRegExp(token)}${trail}`, 'i'), ' ');
  }

  return rest.replace(/\s+/g, ' ').trim();
}

/**
 * Whether a stored class name still agrees with the class's current fields.
 *
 * A name can go stale: `TrialClassInput` carries element, level and section but
 * no name, so editing a class from Interior/Advanced to Interior/Excellent
 * leaves the old "Interior Advanced" behind. Treating that as authored text
 * would render "Excellent Advanced" — worse than the ambiguity this module
 * exists to remove, because it states something untrue rather than something
 * incomplete.
 *
 * A name agrees when every non-empty field still appears in it. "Interior
 * Advanced Preliminary" agrees with Interior/Advanced; "Interior Advanced" does
 * not agree with Interior/Excellent, because Excellent is missing.
 */
export function classNameMatchesFields(
  name: string | null | undefined,
  element: string | null | undefined,
  level: string | null | undefined,
  section: string | null | undefined
): boolean {
  const cleanedName = clean(name);
  if (!cleanedName) return false;

  return [clean(element), clean(level), clean(section)].every(token => {
    if (!token) return true;
    const lead = /^\w/.test(token) ? '\\b' : '';
    const trail = /\w$/.test(token) ? '\\b' : '';
    return new RegExp(`${lead}${escapeRegExp(token)}${trail}`, 'i').test(cleanedName);
  });
}

/** What a caller has already resolved for a class, and groups it by. */
export interface ClassIdentity {
  /** The class's own name, as stored. */
  name?: string | null | undefined;
  /** The element the caller groups under, after its own fallbacks. */
  element?: string | null | undefined;
  /** The level the caller renders, after its own fallbacks. */
  level?: string | null | undefined;
  section?: string | null | undefined;
}

function identityKey(cls: ClassIdentity): string {
  return [clean(cls.element), clean(cls.level), clean(cls.section)]
    .map(part => part.toLowerCase())
    .join('\u0000');
}

/**
 * Build a disambiguator over ONE group of classes — a single trial's classes.
 *
 * Returns extra words only for a class that would otherwise render identically
 * to a DIFFERENT class in the same group, and '' for everything else.
 *
 * The collision test is what makes this safe to apply everywhere. Measured
 * against every class row in the database, applying `classNameExtra`
 * unconditionally rewrote 14 of 24 labels, and 13 of those were harmful: this
 * project's class names carry internal fixture naming, so "Advanced" became
 * "Advanced Load 2 Class 1" and "Novice A" became
 * "Novice A MYK9-336 Past Due Class" on exhibitor-facing surfaces. Publishing
 * a load-test name to an exhibitor is worse than the ambiguity being fixed —
 * a missing entry is quiet, a nonsense one is not.
 *
 * Gated on collision, the same data changes exactly one label: the Heartland
 * Saturday trial's second Interior/Advanced class, which is the case that
 * needed distinguishing. Classes sharing a key AND a name are not a collision;
 * they are the ordinary split-level case and stay merged.
 */
export function buildClassDisambiguator(
  classes: readonly ClassIdentity[]
): (cls: ClassIdentity) => string {
  const namesByKey = new Map<string, Set<string>>();

  for (const cls of classes) {
    const key = identityKey(cls);
    const names = namesByKey.get(key) ?? new Set<string>();
    names.add(clean(cls.name).toLowerCase());
    namesByKey.set(key, names);
  }

  return cls => {
    const names = namesByKey.get(identityKey(cls));
    if (!names || names.size < 2) return '';
    return classNameExtra(cls.name, cls.element, cls.level, cls.section);
  };
}

/**
 * One disambiguator per GROUP (e.g. per trial), built from that group's own
 * classes only. `buildClassDisambiguator`'s collision test is a single-group
 * contract — a Saturday and a Sunday "Interior Advanced" are already told
 * apart by which group they're in, and a cross-group collision test would
 * publish one of their stored names for no reason (see
 * `groupCartByDogAndDay`'s per-trial disambiguators, the same shape repeated
 * here for callers outside the wizard).
 *
 * Returns a lookup by group key rather than a single function, since most
 * callers hold many classes across many groups and want one disambiguator
 * per class's own group.
 */
export function buildClassDisambiguatorsByGroup<T extends ClassIdentity>(
  classes: readonly T[],
  groupKeyOf: (cls: T) => string
): (groupKey: string) => (cls: ClassIdentity) => string {
  const byGroup = new Map<string, T[]>();
  for (const cls of classes) {
    const key = groupKeyOf(cls);
    const group = byGroup.get(key);
    if (group) group.push(cls);
    else byGroup.set(key, [cls]);
  }

  const disambiguatorsByGroup = new Map(
    [...byGroup].map(([key, group]) => [key, buildClassDisambiguator(group)])
  );
  const noop = () => '';
  return groupKey => disambiguatorsByGroup.get(groupKey) ?? noop;
}

/**
 * The full exhibitor-facing label for a class OUTSIDE its element's own
 * grouping — "Vehicle Novice B", not just "Novice B" — composed from
 * element + level + section rather than trusted from the stored name/
 * className. A stored name can predate a later edit, or (UKC classes created
 * outside `generateScentWorkClasses`) never have carried the section at all,
 * which is what let two different UKC A/B classes render as the identical
 * "Vehicle Novice" on the Show Desk schedule, roster and Move-up picker
 * (MYK9-825). `extra` is `buildClassDisambiguator`'s output — pass '' when
 * the caller has no group to disambiguate against. Falls back to
 * `fallback` (the stored name) only when element AND level are both
 * unresolvable, so a class with no configured registry fields still renders
 * as something.
 */
export function buildFullClassLabel(
  fields: Pick<ClassIdentity, 'element' | 'level' | 'section'>,
  extra: string,
  fallback: string | null | undefined
): string {
  const computed = [fields.element, fields.level, fields.section, extra]
    .map(clean)
    .filter(Boolean)
    .join(' ');
  return computed || clean(fallback) || 'Class';
}

/** A trial as far as same-day disambiguation is concerned. */
export interface TrialDayIdentity {
  trialId: string;
  /** Bare `YYYY-MM-DD` date; a trial with no date never collides. */
  trialDate?: string | null | undefined;
  trialName?: string | null | undefined;
}

/**
 * Build a disambiguator for trials that share a calendar day.
 *
 * `buildClassDisambiguator` is deliberately a single-trial contract (see
 * above) — a Saturday and a Sunday trial are already told apart by their day
 * label alone, so a class-name collision test only ever runs within one
 * trial's own classes. It says nothing about TWO trials landing on the SAME
 * day (MYK9-832 #10: a two-trial Saturday show entering a dog in both trials'
 * "Vehicle Novice B" showed the identical row twice, disambiguated only by a
 * day label ("Sat ·") that was the same for both).
 *
 * Gated on collision, the same way: a trial's own name is returned only when
 * another trial in the given set shares its date, so the common one-trial-
 * per-day case never gains a redundant suffix.
 */
export function buildTrialDayDisambiguator(
  trials: readonly TrialDayIdentity[]
): (trialId: string) => string {
  const trialIdsByDate = new Map<string, Set<string>>();
  const trialsById = new Map<string, TrialDayIdentity>();

  for (const trial of trials) {
    trialsById.set(trial.trialId, trial);
    const date = clean(trial.trialDate);
    if (!date) continue;
    const ids = trialIdsByDate.get(date) ?? new Set<string>();
    ids.add(trial.trialId);
    trialIdsByDate.set(date, ids);
  }

  return trialId => {
    const trial = trialsById.get(trialId);
    const date = clean(trial?.trialDate);
    if (!date) return '';
    const collidingIds = trialIdsByDate.get(date);
    if (!collidingIds || collidingIds.size < 2) return '';
    return clean(trial?.trialName);
  };
}
