import type { Show, ShowTrial } from '@/types/show-types';

/**
 * The offered-classes view of a show, grouped trial -> element -> level.
 *
 * INTENT: let a signed-out exhibitor decide whether a show is worth entering
 * without an account and without leaving the premium. The question this answers
 * is "does this show offer the thing my dog is entered for" — if a show runs no
 * Interior and Interior is what they want, they should learn that here.
 *
 * Grouping is by TRIAL first because a show can span registries: an AKC Scent
 * Work trial, a UKC Nosework trial and an ASCA Scent Detection trial offer
 * different elements on different days, and "this show has Interior" is the
 * wrong answer when only Saturday does.
 *
 * Ordering is FIRST-SEEN, never alphabetical and never a hardcoded element
 * list. The repo carries several AKC element orders
 * (`Interior, Exterior, Container, Buried`), but they are AKC's, and a UKC
 * trial offers Vehicle while ASCA uses Open where AKC uses Excellent. Imposing
 * one registry's vocabulary on another's trial would reorder it wrongly and
 * silently. First-seen preserves whatever order the classes already carry,
 * which is the secretary's own.
 */

export interface OfferedLevel {
  level: string;
  /** Section letters when a level is split (A/B). Empty when it is not split. */
  sections: string[];
}

export interface OfferedElement {
  element: string;
  levels: OfferedLevel[];
}

export interface OfferedClassesTrial {
  trialId: string;
  trialName: string;
  date: string | null;
  elements: OfferedElement[];
}

/** A class row as it reaches the landing, with only the fields we read. */
interface ClassLike {
  element?: string | null | undefined;
  level?: string | null | undefined;
  section?: string | null | undefined;
  name?: string | null | undefined;
}

/**
 * Elements and levels are free text in the database. Trim, and treat blank as
 * absent so a stray space does not open an empty "" group in the UI.
 */
function clean(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Fall back to the class name when `element` is unset. A show whose classes
 * predate element tagging still has a name, and showing the name beats showing
 * nothing to an exhibitor trying to decide.
 */
function elementLabel(cls: ClassLike): string | null {
  return clean(cls.element) ?? clean(cls.name);
}

function groupTrial(trial: ShowTrial): OfferedClassesTrial | null {
  const classes = (trial.classes ?? []) as ClassLike[];

  const byElement = new Map<string, Map<string, Set<string>>>();

  for (const cls of classes) {
    const element = elementLabel(cls);
    if (!element) continue;

    const levels = byElement.get(element) ?? new Map<string, Set<string>>();
    byElement.set(element, levels);

    // A class with an element but no level still belongs under that element.
    // '' is the "no level stated" bucket and renders as the element alone.
    const level = clean(cls.level) ?? '';
    const sections = levels.get(level) ?? new Set<string>();
    levels.set(level, sections);

    const section = clean(cls.section);
    if (section) sections.add(section);
  }

  if (byElement.size === 0) return null;

  return {
    trialId: trial.id,
    trialName: clean(trial.name) ?? clean(trial.trialNumber) ?? 'Trial',
    date: clean(trial.date),
    elements: [...byElement.entries()].map(([element, levels]) => ({
      element,
      levels: [...levels.entries()].map(([level, sections]) => ({
        level,
        sections: [...sections].sort(),
      })),
    })),
  };
}

/**
 * Build the grouped offered-classes view. Trials with no classes are dropped
 * rather than rendered empty: a trial whose classes are not published yet is
 * noise to an exhibitor, not information. Returns an empty array when the show
 * has nothing to show, and the caller then renders no section at all.
 */
export function buildOfferedClasses(show: Show | null | undefined): OfferedClassesTrial[] {
  const trials = show?.trials ?? [];
  return trials.map(groupTrial).filter((trial): trial is OfferedClassesTrial => trial !== null);
}

/** Anchor id for the offered-classes section, shared by the link and section. */
export const OFFERED_CLASSES_ANCHOR = 'offered-classes';
