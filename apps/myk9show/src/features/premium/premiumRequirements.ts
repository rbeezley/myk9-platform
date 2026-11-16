/**
 * MYK9-2053: what the registry requires in a premium list that is still empty, said before
 * "Generate & publish premium" so the secretary can fix it first. Warns; it never blocks.
 *
 * The facts and who requires them come from {@link PREMIUM_FACT_CATALOG}; emptiness is read off
 * the same shapes `buildPremiumFacts` produces, so this list and the printed PDF agree (a fact
 * missing here is a fact the PDF leaves out, and the PDF prints no placeholder for it).
 */
import type { RegistryId } from '@/features/registries';
import { getShowEditHref } from '@/components/shows/showEditRoutes';
import { getSelectClassesHref } from '@/pages/secretary/selectClassesRoutes';
import {
  PREMIUM_FACT_CATALOG,
  type PremiumFactDefinition,
  type PremiumFactId,
  type PremiumFacts,
} from './premiumFacts';

/** The slice of {@link PremiumFacts} the requirement checks read. A full PremiumFacts fits. */
export interface PremiumRequirementFacts {
  clubName: PremiumFacts['clubName'];
  venue: PremiumFacts['venue'];
  startDate: PremiumFacts['startDate'];
  fees: Pick<PremiumFacts['fees'], 'hasAny'>;
  entry: PremiumFacts['entry'];
  secretary: Pick<PremiumFacts['secretary'], 'name'>;
  chair: Pick<NonNullable<PremiumFacts['chair']>, 'name'> | null;
  committee: PremiumFacts['committee'];
  trials: Array<
    Pick<PremiumFacts['trials'][number], 'name' | 'eventNumber' | 'classLabels'> & {
      judges: ReadonlyArray<unknown>;
    }
  >;
}

/** Where each fact is entered. A null club id means the club page cannot be linked. */
export interface PremiumRequirementTargets {
  showId: string;
  clubId: string | null;
}

/** One required fact that is still empty: a sentence and the place to fix it. */
export interface PremiumRequirementItem {
  id: PremiumFactId;
  /** Unique within a list: the fact id, plus the trial's position for a per-trial item. */
  key: string;
  message: string;
  /** Route to the field, or null when the fact has no editable home. */
  href: string | null;
}

/**
 * Required facts no one types in, so there is nothing to ask for: the narratives are written at
 * generation, the policy falls back to the registry's default, and the scouting statement is the
 * registry's own words.
 */
const SUPPLIED_AT_GENERATION: ReadonlySet<PremiumFactId> = new Set([
  'showHours',
  'trialInformation',
  'withdrawalPolicy',
  'scoutingStatement',
]);

interface Check {
  /** Null when the fact is present. */
  missing: (
    facts: PremiumRequirementFacts,
    registry: RegistryId,
    minimum: number | undefined
  ) => string | null | Array<{ message: string; key: string }>;
  href: (t: PremiumRequirementTargets) => string | null;
}

const trialLabel = (t: { name: string }, index: number) => t.name.trim() || `Trial ${index + 1}`;

const blank = (value: string | null | undefined) => !value?.trim();
const editShow = (tab: Parameters<typeof getShowEditHref>[1]) => (t: PremiumRequirementTargets) =>
  getShowEditHref(t.showId, tab);

function committeeMessage(
  registry: RegistryId,
  count: number,
  minimum: number | undefined
): string | null {
  if (count === 0) return `${registry} requires an Event Committee. Add it on the club.`;
  if (minimum !== undefined && count < minimum) {
    return `${registry} requires at least ${minimum} Event Committee members; ${count} ${
      count === 1 ? 'is' : 'are'
    } listed. Add the rest on the club.`;
  }
  return null;
}

const CHECKS: Partial<Record<PremiumFactId, Check>> = {
  clubName: {
    missing: (f, r) =>
      blank(f.clubName)
        ? `${r} requires the name of the club. Choose the club in Edit show.`
        : null,
    href: editShow('basic'),
  },
  venue: {
    missing: (f, r) =>
      blank(f.venue) ? `${r} requires the show's location. Add it in Edit show.` : null,
    href: editShow('basic'),
  },
  dates: {
    missing: (f, r) =>
      blank(f.startDate) ? `${r} requires the date of the event. Add it in Edit show.` : null,
    href: editShow('basic'),
  },
  eventNumber: {
    missing: (f, r) =>
      f.trials.flatMap((t, i) =>
        blank(t.eventNumber)
          ? [
              {
                key: `eventNumber:${i}`,
                message: `${r} requires an event number for ${trialLabel(t, i)}. Add it on the trial.`,
              },
            ]
          : []
      ),
    href: t => `/shows/${t.showId}`,
  },
  fees: {
    missing: (f, r) =>
      f.fees.hasAny ? null : `${r} requires the entry fees. Add them in Edit show.`,
    href: editShow('fees'),
  },
  classes: {
    missing: (f, r) =>
      f.trials.length > 0 && f.trials.every(t => t.classLabels.length > 0)
        ? null
        : `${r} requires the classes offered. Add them in Select classes.`,
    href: t => getSelectClassesHref(t.showId),
  },
  judges: {
    missing: (f, r) =>
      f.trials.length === 0
        ? `${r} requires the judges. Add them in Edit show.`
        : f.trials.flatMap((t, i) =>
            t.judges.length === 0
              ? [
                  {
                    key: `judges:${i}`,
                    message: `${r} requires a judge for ${trialLabel(t, i)}. Assign one in Judges.`,
                  },
                ]
              : []
          ),
    href: editShow('judges'),
  },
  secretary: {
    missing: (f, r) =>
      blank(f.secretary.name)
        ? `${r} requires the Trial Secretary. Add them in Edit show, under Personnel.`
        : null,
    href: editShow('personnel'),
  },
  chair: {
    missing: (f, r) =>
      f.chair && !blank(f.chair.name)
        ? null
        : `${r} requires the Trial Chair. Add them in Edit show, under Personnel.`,
    href: editShow('personnel'),
  },
  entryWindow: {
    missing: (f, r) =>
      blank(f.entry.opens) || blank(f.entry.closes)
        ? `${r} requires when entries open and close. Add both dates in Edit show.`
        : null,
    href: editShow('basic'),
  },
  committee: {
    missing: (f, r, minimum) => committeeMessage(r, f.committee.length, minimum),
    href: t => (t.clubId ? `/clubs/${t.clubId}?tab=members` : null),
  },
};

function isRequired(def: PremiumFactDefinition, registry: RegistryId): boolean {
  return def.requiredBy.includes(registry) && !SUPPLIED_AT_GENERATION.has(def.id);
}

/**
 * The facts `registry` requires that are empty (or short of their minimum), in catalog order.
 * `unavailable` names facts whose source could not be read right now: they are left out rather
 * than reported as empty, because "could not load" is not "nothing there".
 */
export function missingPremiumFacts(
  facts: PremiumRequirementFacts,
  registry: RegistryId,
  targets: PremiumRequirementTargets,
  unavailable: ReadonlySet<PremiumFactId> = new Set()
): PremiumRequirementItem[] {
  const items: PremiumRequirementItem[] = [];
  for (const def of PREMIUM_FACT_CATALOG) {
    const check = CHECKS[def.id];
    if (!check || !isRequired(def, registry) || unavailable.has(def.id)) continue;
    const result = check.missing(facts, registry, def.minimumBy?.[registry]);
    const href = check.href(targets);
    if (typeof result === 'string') items.push({ id: def.id, key: def.id, message: result, href });
    else
      for (const r of result ?? [])
        items.push({ id: def.id, key: r.key, message: r.message, href });
  }
  return items;
}

/** Ids the catalog requires for some registry that this module neither checks nor supplies. */
export function uncheckedRequiredFactIds(): PremiumFactId[] {
  return PREMIUM_FACT_CATALOG.filter(
    d => d.requiredBy.length > 0 && !CHECKS[d.id] && !SUPPLIED_AT_GENERATION.has(d.id)
  ).map(d => d.id);
}
