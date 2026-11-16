import { useQuery } from '@tanstack/react-query';
import { COMMITTEE_QUERY_KEY } from '@/components/committee/useCommittee';
import { getTrialRegistry } from '@/features/registries';
import { useShowOfficials } from '@/hooks/queries/useShowOfficials';
import { fetchShowCommittee } from '@/services/database/club-memberships/committee';
import type { ClassInfo } from '@/components/shows/tabs/ClassesTab';
import type { Trial } from '@/components/trials/types/trial.types';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { Show } from '@/types/show-types';
import type { PremiumFactId } from './premiumFacts';
import {
  missingPremiumFacts,
  type PremiumRequirementFacts,
  type PremiumRequirementItem,
} from './premiumRequirements';

interface PremiumRequirementInputs {
  show: Show;
  trials: ReadonlyArray<Trial>;
  classes: ReadonlyArray<ClassInfo>;
  judges: ReadonlyArray<ShowJudgeAssignment>;
  secretaryName: string | null;
  chairName: string | null;
  committee: string[];
}

const positive = (raw: string | undefined) => (Number.parseFloat(raw ?? '') || 0) > 0;

/**
 * The show as the requirement checks read it, from what the About page already holds. These are
 * the same sources generate-premium reads, mapped to the shapes `buildPremiumFacts` prints from.
 */
export function requirementFactsFromShow(input: PremiumRequirementInputs): PremiumRequirementFacts {
  const { show } = input;
  return {
    clubName: show.clubName?.trim() || null,
    venue: show.location?.trim() ?? '',
    startDate: show.startDate ?? '',
    fees: { hasAny: positive(show.preEntryFee) || positive(show.dayOfShowFee) },
    entry: {
      opens: show.entryOpenDate?.trim() || null,
      closes: show.entryCloseDate?.trim() || null,
    },
    secretary: { name: input.secretaryName },
    chair: input.chairName ? { name: input.chairName } : null,
    committee: input.committee,
    trials: input.trials.map(trial => {
      const trialClasses = input.classes.filter(cls => cls.trialId === trial.id);
      const classIds = new Set(trialClasses.map(cls => cls.id));
      return {
        name: trial.name ?? '',
        eventNumber: trial.eventNumber ?? null,
        classLabels: trialClasses.map(cls => cls.name),
        // The premium lists a trial's judges from its own assignments: a judge counts for the
        // trial when assigned to one of its classes.
        judges: input.judges.filter(j => j.assignedClasses?.some(id => classIds.has(id))),
      };
    }),
  };
}

export interface PremiumRequirements {
  /** Required facts still empty. [] until every source has answered. */
  items: PremiumRequirementItem[];
  /** The registry the premium is checked against. */
  registry: string;
}

const personName = (p: { firstName: string; lastName: string } | undefined) =>
  p ? `${p.firstName} ${p.lastName}`.trim() || null : null;

/** The checklist for the About page: the show's own data plus officials and the committee. */
export function usePremiumRequirements(
  show: Show,
  trials: ReadonlyArray<Trial>,
  classes: ReadonlyArray<ClassInfo>,
  judges: ReadonlyArray<ShowJudgeAssignment>,
  enabled: boolean
): PremiumRequirements {
  const officials = useShowOfficials(enabled ? show.id : undefined);
  // The same query the Personnel tab's committee editor runs, so an edit there refreshes this.
  const committee = useQuery({
    queryKey: [COMMITTEE_QUERY_KEY, 'effective', show.id],
    queryFn: async () => {
      const names = await fetchShowCommittee(show.id);
      if (!names) throw new Error('Could not read the committee');
      return names;
    },
    enabled,
  });

  const registry = getTrialRegistry(trials[0]).id;
  if (!enabled) return { items: [], registry };

  // A source that has not answered is left out, never reported as empty.
  const unavailable = new Set<PremiumFactId>();
  if (!officials.data) {
    unavailable.add('secretary');
    unavailable.add('chair');
  }
  if (!committee.data) unavailable.add('committee');

  const facts = requirementFactsFromShow({
    show,
    trials,
    classes,
    judges,
    secretaryName: personName(officials.data?.secretaries[0]),
    chairName: personName(officials.data?.chairmen[0]),
    committee: committee.data ?? [],
  });
  return {
    items: missingPremiumFacts(
      facts,
      registry,
      { showId: show.id, clubId: show.clubId || null },
      unavailable
    ),
    registry,
  };
}
