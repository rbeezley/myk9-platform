/**
 * MYK9-2053: what the registry requires in a premium list that is still empty, said before
 * "Generate & publish premium" so the secretary can fix it first. Warns; it never blocks.
 *
 * The facts and who requires them come from {@link PREMIUM_FACT_CATALOG}; emptiness is read off
 * the same shapes `buildPremiumFacts` produces, so this list and the printed PDF agree (a fact
 * missing here is a fact the PDF leaves out, and the PDF prints no placeholder for it).
 */
import { formatCalendarDateLong, recordingFeeRateInForce } from '@myk9/core';
import type { RegistryId } from '@/features/registries';
import { getShowEditHref } from '@/components/shows/showEditRoutes';
import { getSelectClassesHref } from '@/pages/secretary/selectClassesRoutes';
import {
  PREMIUM_FACT_CATALOG,
  type PremiumFactDefinition,
  type PremiumFactId,
  type PremiumFacts,
} from './premiumFacts';

/**
 * What an official's row adds to the name. An email or phone key left out (undefined) means the
 * contact is not known here, so nothing is said; null or '' means known and empty.
 */
interface OfficialExtras {
  mailingAddress?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** The slice of {@link PremiumFacts} the requirement checks read. A full PremiumFacts fits. */
export interface PremiumRequirementFacts {
  clubName: PremiumFacts['clubName'];
  venue: PremiumFacts['venue'];
  startDate: PremiumFacts['startDate'];
  fees: Pick<PremiumFacts['fees'], 'hasAny'>;
  entry: PremiumFacts['entry'];
  secretary: Pick<PremiumFacts['secretary'], 'name'> & OfficialExtras;
  chair: (Pick<NonNullable<PremiumFacts['chair']>, 'name'> & OfficialExtras) | null;
  committee: PremiumFacts['committee'];
  /**
   * MYK9-2286: the club template's facts (ASCA §1.5.8, §1.5.20, §1.5.21). Absent means not known
   * here, and nothing is said; a club with no template passes empty values.
   */
  template?: {
    vetClinic: { name: string; phone: string; address: string } | null;
    accommodationCount: number;
    awardsDescription: string | null;
    /** MYK9-2291 (ASCA §1.5.18). */
    limitedMobilityNotes?: string | null;
  };
  /**
   * MYK9-2044: the calendar dates the recording fee is priced on (each live trial's date, else
   * the show's start date). Absent means not known here, and nothing is said about the fee.
   */
  recordingFeeDates?: readonly string[];
  /** MYK9-2290: the show's ASCA terms as printed. Absent means not known here, and nothing is said. */
  showTerms?: ReadonlyArray<{ label: string }>;
  /** MYK9-2292: each judge on the show with the affiliation typed on them. Absent means not known here. */
  judgeAffiliations?: ReadonlyArray<{
    id: string;
    name: string;
    affiliation: string | null;
    /** Whether the viewer may edit that person; only then does the item link to their profile. */
    canEdit?: boolean;
  }>;
  trials: Array<
    Pick<PremiumFacts['trials'][number], 'name' | 'eventNumber' | 'classLabels'> & {
      /** The trial's id when known; it scopes the link to that trial. */
      id?: string;
      judges: ReadonlyArray<unknown>;
    }
  >;
}

/** Where each fact is entered. A null club id means the club page cannot be linked. */
export interface PremiumRequirementTargets {
  showId: string;
  clubId: string | null;
  /**
   * Whose Event Committee the show prints: its own list (edited in Edit show, Personnel) or the
   * club's (edited on the club's Members tab). Omitted means the club's.
   */
  committeeSource?: 'show' | 'club';
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
    minimum: number | undefined,
    targets: PremiumRequirementTargets
  ) => string | null | Array<{ message: string; key: string; href?: string }>;
  href: (t: PremiumRequirementTargets) => string | null;
}

const trialLabel = (t: { name: string }, index: number) => t.name.trim() || `Trial ${index + 1}`;

const blank = (value: string | null | undefined) => !value?.trim();
const editShow = (tab: Parameters<typeof getShowEditHref>[1]) => (t: PremiumRequirementTargets) =>
  getShowEditHref(t.showId, tab);

const clubPage = (t: PremiumRequirementTargets) => (t.clubId ? `/clubs/${t.clubId}` : null);

/** True once the official's contact is known here and holds neither a phone nor an email. */
function contactMissing(o: OfficialExtras): boolean {
  if (o.email === undefined && o.phone === undefined) return false;
  return blank(o.email) && blank(o.phone);
}

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

/** An ASCA show term typed on the show: missing once the premium's printed terms lack its label. */
function showTermCheck(label: string, what: string): Check {
  return {
    missing: (f, r) =>
      f.showTerms && !f.showTerms.some(term => term.label === label)
        ? `${r} requires ${what}. Add it in Edit show, under Premium.`
        : null,
    href: editShow('premium'),
  };
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
                message: `${r} requires an event number for ${trialLabel(t, i)}. Open Trials and choose Edit on that trial.`,
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
    // A trial with no classes yet is the classes item's to report. A judge on the show roster
    // (a show-level assignment) counts for every trial, as the premium lists them.
    missing: (f, r, _min, t) =>
      f.trials.flatMap((trial, i) =>
        trial.classLabels.length > 0 && trial.judges.length === 0
          ? [
              {
                key: `judges:${i}`,
                message: `${r} requires a judge for ${trialLabel(trial, i)}. Assign one to its classes in Select classes.`,
                href: getSelectClassesHref(
                  t.showId,
                  undefined,
                  trial.id ? { trialId: trial.id } : {}
                ),
              },
            ]
          : []
      ),
    href: editShow('judges'),
  },
  // MYK9-2292: ASCA §1.5.7. One item per judge on the show with no affiliation on their record.
  judgeAffiliation: {
    missing: (f, r) =>
      (f.judgeAffiliations ?? [])
        .filter(j => blank(j.affiliation))
        .map(j => ({
          key: `judgeAffiliation:${j.id}`,
          message: `${r} requires each judge's affiliation. Ask ${j.name} to add their affiliation on their myK9 profile.`,
          ...(j.canEdit && { href: `/people/${j.id}` }),
        })),
    href: () => null,
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
  // MYK9-2065: asked for only once there is an official to ask about; a missing official is
  // already listed above and has no address to print.
  secretaryAddress: {
    missing: (f, r) =>
      !blank(f.secretary.name) && blank(f.secretary.mailingAddress)
        ? `${r} requires the Trial Secretary's mailing address. Add it in Edit show, under Personnel.`
        : null,
    href: editShow('personnel'),
  },
  chairAddress: {
    missing: (f, r) =>
      f.chair && !blank(f.chair.name) && blank(f.chair.mailingAddress)
        ? `${r} requires the Trial Chair's mailing address. Add it in Edit show, under Personnel.`
        : null,
    href: editShow('personnel'),
  },
  secretaryContact: {
    missing: (f, r) =>
      !blank(f.secretary.name) && contactMissing(f.secretary)
        ? `${r} requires a phone or email for the Trial Secretary. It comes from their own profile, so ask them to add one, or choose another Secretary in Edit show, under Personnel.`
        : null,
    href: editShow('personnel'),
  },
  chairContact: {
    missing: (f, r) =>
      f.chair && !blank(f.chair.name) && contactMissing(f.chair)
        ? `${r} requires a phone or email for the Trial Chair. It comes from their own profile, so ask them to add one, or choose another Chair in Edit show, under Personnel.`
        : null,
    href: editShow('personnel'),
  },
  vetClinic: {
    missing: (f, r) =>
      f.template &&
      (blank(f.template.vetClinic?.name) ||
        (blank(f.template.vetClinic?.phone) && blank(f.template.vetClinic?.address)))
        ? `${r} requires the emergency veterinarian, with a phone or address. Add it to the club's premium template.`
        : null,
    href: clubPage,
  },
  accommodations: {
    missing: (f, r) =>
      f.template && f.template.accommodationCount === 0
        ? `${r} requires accommodations. Add them to the club's premium template.`
        : null,
    href: clubPage,
  },
  awards: {
    missing: (f, r) =>
      f.template && blank(f.template.awardsDescription)
        ? `${r} requires the awards. Add them to the club's premium template.`
        : null,
    href: clubPage,
  },
  ascaSanctionStatus: showTermCheck(
    'Sanctioning status',
    'the sanctioning status (pending or approved)'
  ),
  scentsByLevel: showTermCheck('Scents used for each level', 'the scents used for each level'),
  spectatorsPolicy: showTermCheck(
    'Spectators and videoing',
    'whether spectators and videoing are allowed'
  ),
  // MYK9-2291: ASCA §1.5.18. RV hook-ups (§1.5.22) apply only to an RV park, so they are optional.
  limitedMobility: {
    missing: (f, r) =>
      f.template && blank(f.template.limitedMobilityNotes)
        ? `${r} requires concerns for handicapped or limited-mobility handlers or dogs (say so if there are none). Add them to the club's premium template.`
        : null,
    href: clubPage,
  },
  entryWindow: {
    missing: (f, r) =>
      blank(f.entry.opens) || blank(f.entry.closes)
        ? `${r} requires when entries open and close. Add both dates in Edit show.`
        : null,
    href: editShow('basic'),
  },
  // Warns only: the premium simply omits a fee the app does not know, and never guesses one.
  recordingFee: {
    missing: (f, r) =>
      (f.recordingFeeDates ?? [])
        .filter(day => !recordingFeeRateInForce(r, day))
        .map(day => ({
          key: `recordingFee:${day}`,
          message: `The ${r} recording fee for ${formatCalendarDateLong(day)} is not known to the app yet, so the premium will not state it. Confirm the fee with ${r} before you publish.`,
        })),
    href: () => null,
  },
  committee: {
    missing: (f, r, minimum) => committeeMessage(r, f.committee.length, minimum),
    href: t =>
      t.committeeSource === 'show'
        ? getShowEditHref(t.showId, 'personnel')
        : t.clubId
          ? `/clubs/${t.clubId}?tab=members`
          : null,
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
    const result = check.missing(facts, registry, def.minimumBy?.[registry], targets);
    const href = check.href(targets);
    if (typeof result === 'string') items.push({ id: def.id, key: def.id, message: result, href });
    else
      for (const r of result ?? [])
        items.push({ id: def.id, key: r.key, message: r.message, href: r.href ?? href });
  }
  return items;
}

/** Ids the catalog requires for some registry that this module neither checks nor supplies. */
export function uncheckedRequiredFactIds(): PremiumFactId[] {
  return PREMIUM_FACT_CATALOG.filter(
    d => d.requiredBy.length > 0 && !CHECKS[d.id] && !SUPPLIED_AT_GENERATION.has(d.id)
  ).map(d => d.id);
}
