import { useQuery } from '@tanstack/react-query';
import { isLivePremiumTrial, premiumRecordingFeeDates } from '@myk9/core';
import { COMMITTEE_QUERY_KEY, committeeScopeKey } from '@/components/committee/useCommittee';
import {
  getTrialRegistry,
  resolveConfiguredRegistryId,
  type RegistryId,
} from '@/features/registries';
import { useShowOfficials } from '@/hooks/queries/useShowOfficials';
import { fetchShowCommittee, getCommittee } from '@/services/database/club-memberships/committee';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { Show } from '@/types/show-types';
import type { PremiumFactId } from './premiumFacts';
import {
  missingPremiumFacts,
  type PremiumRequirementFacts,
  type PremiumRequirementItem,
} from './premiumRequirements';

/** The trial fields the checks read; the replicated trial and the domain Trial both fit. */
interface RequirementTrial {
  id: string;
  name?: string | undefined;
  eventNumber?: string | undefined;
  registryId?: string | null | undefined;
  /** MYK9-2044: the date and status the recording fee is priced from. */
  trialDate?: string | undefined;
  status?: string | undefined;
  /** MYK9-2186: a soft-deleted trial is not in the premium. */
  deletedAt?: string | null | undefined;
}

/** The class fields the checks read; Show Desk class rows and the About tab's both fit. */
interface RequirementClass {
  id: string;
  trialId: string;
  name: string;
}

interface PremiumRequirementInputs {
  show: Show;
  trials: ReadonlyArray<RequirementTrial>;
  classes: ReadonlyArray<RequirementClass>;
  judges: ReadonlyArray<ShowJudgeAssignment>;
  secretaryName: string | null;
  secretaryAddress?: string | null;
  chairName: string | null;
  chairAddress?: string | null;
  committee: string[];
}

const positive = (raw: string | undefined) => (Number.parseFloat(raw ?? '') || 0) > 0;

/**
 * The show as the requirement checks read it, from what the About page already holds. These are
 * the same sources generate-premium reads, mapped to the shapes `buildPremiumFacts` prints from.
 */
export function requirementFactsFromShow(input: PremiumRequirementInputs): PremiumRequirementFacts {
  const { show } = input;
  // MYK9-2186: the premium covers live trials only, the same rule Regenerate and publish use.
  const trials = input.trials.filter(trial =>
    isLivePremiumTrial({ status: trial.status ?? null, deleted_at: trial.deletedAt ?? null })
  );
  return {
    clubName: show.clubName?.trim() || null,
    venue: show.location?.trim() ?? '',
    startDate: show.startDate ?? '',
    fees: { hasAny: positive(show.preEntryFee) || positive(show.dayOfShowFee) },
    entry: {
      opens: show.entryOpenDate?.trim() || null,
      closes: show.entryCloseDate?.trim() || null,
    },
    secretary: { name: input.secretaryName, mailingAddress: input.secretaryAddress ?? null },
    chair: input.chairName
      ? { name: input.chairName, mailingAddress: input.chairAddress ?? null }
      : null,
    committee: input.committee,
    recordingFeeDates: premiumRecordingFeeDates(
      trials.map(trial => ({ date: trial.trialDate ?? null, status: trial.status ?? null })),
      show.startDate
    ),
    trials: trials.map(trial => {
      const trialClasses = input.classes.filter(cls => cls.trialId === trial.id);
      const classIds = new Set(trialClasses.map(cls => cls.id));
      return {
        id: trial.id,
        name: trial.name ?? '',
        eventNumber: trial.eventNumber ?? null,
        classLabels: trialClasses.map(cls => cls.name),
        // As the premium lists them (judgesForTrial): a judge assigned to one of the trial's
        // classes, or on the show roster with no class assignment yet, who counts for every trial.
        judges: input.judges.filter(j =>
          j.assignedClasses?.length
            ? j.assignedClasses.some(id => classIds.has(id))
            : j.hasShowLevelAssignment === true
        ),
      };
    }),
  };
}

export interface PremiumRequirements {
  /** Required facts still empty. [] until every source has answered. */
  items: PremiumRequirementItem[];
  /** The registry the premium is checked against. */
  registry: RegistryId | null;
}

const personName = (p: { firstName: string; lastName: string } | undefined) =>
  p ? `${p.firstName} ${p.lastName}`.trim() || null : null;

/** The checklist for the About page: the show's own data plus officials and the committee. */
export function usePremiumRequirements(
  show: Show,
  trials: ReadonlyArray<RequirementTrial>,
  classes: ReadonlyArray<RequirementClass>,
  /** The show's judge roster, or null where the caller does not hold it (judges are not checked). */
  judges: ReadonlyArray<ShowJudgeAssignment> | null,
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
  // Whether the show has replaced the club's committee; decides which list "Fix it" opens.
  const ownCommittee = useQuery({
    queryKey: committeeScopeKey({ kind: 'show', showId: show.id }),
    queryFn: () => getCommittee({ kind: 'show', showId: show.id }),
    enabled,
  });

  // The trial's registry, else the show's own organization. A registry the app has no rules for
  // (so no AKC default) has nothing to require.
  const registry: RegistryId | null = trials[0]
    ? getTrialRegistry(trials[0]).id
    : resolveConfiguredRegistryId(show.organization);
  // Hold the list until the officials and committee answer, so it does not grow under the reader.
  if (!enabled || !registry || officials.isLoading || committee.isLoading) {
    return { items: [], registry };
  }

  // A source that has not answered is left out, never reported as empty.
  const unavailable = new Set<PremiumFactId>();
  if (!officials.data) {
    unavailable.add('secretary');
    unavailable.add('chair');
    unavailable.add('secretaryAddress');
    unavailable.add('chairAddress');
  }
  if (!committee.data) unavailable.add('committee');
  if (!judges) unavailable.add('judges');

  const facts = requirementFactsFromShow({
    show,
    trials,
    classes,
    judges: judges ?? [],
    secretaryName: personName(officials.data?.secretaries[0]),
    secretaryAddress: officials.data?.secretaries[0]?.mailingAddress ?? null,
    chairName: personName(officials.data?.chairmen[0]),
    chairAddress: officials.data?.chairmen[0]?.mailingAddress ?? null,
    committee: committee.data ?? [],
  });
  return {
    items: missingPremiumFacts(
      facts,
      registry,
      {
        showId: show.id,
        clubId: show.clubId || null,
        committeeSource: ownCommittee.data?.length ? 'show' : 'club',
      },
      unavailable
    ),
    registry,
  };
}
