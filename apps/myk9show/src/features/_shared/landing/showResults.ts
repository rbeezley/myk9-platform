import type { ClassInfo } from '@/components/shows/tabs/ClassesTab';
import {
  buildClassDisambiguatorsByGroup,
  buildFullClassLabel,
} from '@/features/_shared/classLabel';
import { classTrialLabel } from '@/components/shows/tabs/classInfo';
import { showDateRangeStatus } from '@/utils/date-format';
import type { Show } from '@/types/show-types';

/** The one rule for "this show has already happened", shared by every public landing surface. */
export function hasShowHappened(
  show: Pick<Show, 'startDate' | 'endDate'> | null | undefined
): boolean {
  return !!show && showDateRangeStatus(show.startDate, show.endDate) === 'past';
}

export interface ReleasedResultClass {
  id: string;
  name: string;
  /** "Saturday, October 17, 2026 — Trial 1": groups the link for a multi-trial show. */
  trialLabel: string;
  href: string;
}

/**
 * The public results summary for a show that has happened, or null when there is
 * nothing to say: the show is not over, or its class list has not been read (an
 * empty list is "unknown", so a cold read never claims results are withheld).
 * Only classes whose results are released are returned; withheld ones never appear.
 */
export function buildShowResults(
  show: Pick<Show, 'id' | 'startDate' | 'endDate'>,
  classes: readonly ClassInfo[]
): { released: ReleasedResultClass[] } | null {
  if (!hasShowHappened(show) || classes.length === 0) return null;
  // The app's one labeling rule (OverrideTree, buildMoveUpClassLabeler): the disambiguator is built
  // over EVERY class, withheld included, so a released class is told apart from a withheld sibling.
  const identityOf = (cls: ClassInfo) => ({
    trialId: cls.trialId,
    name: cls.className ?? cls.name,
    element: cls.element,
    level: cls.level,
    section: cls.section,
  });
  const disambiguatorFor = buildClassDisambiguatorsByGroup(classes.map(identityOf), c => c.trialId);
  const released = classes
    .filter(cls => !!cls.resultsReleasedAt)
    .map(cls => {
      const identity = identityOf(cls);
      return {
        id: cls.id,
        name: buildFullClassLabel(identity, disambiguatorFor(cls.trialId)(identity), identity.name),
        trialLabel: classTrialLabel(cls),
        href: `/shows/${encodeURIComponent(show.id)}/trials/${encodeURIComponent(cls.trialId)}/classes/${encodeURIComponent(cls.id)}/results`,
      };
    });
  return { released };
}
