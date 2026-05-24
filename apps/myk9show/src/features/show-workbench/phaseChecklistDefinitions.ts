import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { LegacyShowWorkbenchPhase } from '@/hooks/useActivePhase';

export interface ShowWorkbenchClassSummary {
  id: string;
  name: string;
  element: string;
  level: string;
  section: string;
  judgeName: string;
  trialId: string;
  time: string;
  status: string;
  entryCount: number;
  scoredCount: number;
  trialDate: string;
  trialNumber: string;
  trialName: string;
}

export interface ShowWorkbenchEntrySummary {
  id?: string | undefined;
  class_id?: string | undefined;
  entry_status?: string | null | undefined;
  check_in_status?: string | null | undefined;
}

export interface PhaseChecklistContext {
  show: Show;
  trials: SyncableTrial[];
  classes: ShowWorkbenchClassSummary[];
  entries: ShowWorkbenchEntrySummary[];
  judges: unknown[];
}

export interface PhaseChecklistDefinition {
  id: string;
  phase: LegacyShowWorkbenchPhase;
  title: string;
  detail: string;
  autoComplete: (context: PhaseChecklistContext) => boolean;
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function hasPublishedExhibitorMaterials(show: Show): boolean {
  return Boolean(show.publishedPremiumUrl || show.publishedPremiumAt || show.experienceIsPublished);
}

function hasJudgesAssigned(context: PhaseChecklistContext): boolean {
  if (context.judges.length > 0) return true;
  return context.classes.length > 0 && context.classes.every(cls => hasText(cls.judgeName));
}

const phaseChecklistDefinitions: PhaseChecklistDefinition[] = [
  {
    id: 'setup-show-details',
    phase: 'setup',
    title: 'Show details are set',
    detail: 'Dates, venue, club, and registry are ready for exhibitors and staff.',
    autoComplete: ({ show }) =>
      hasText(show.name) &&
      hasText(show.organization) &&
      hasText(show.startDate) &&
      hasText(show.endDate) &&
      hasText(show.location) &&
      hasText(show.clubName),
  },
  {
    id: 'setup-trials-added',
    phase: 'setup',
    title: 'Trials are added',
    detail: 'Each trial day exists before run order and class work begins.',
    autoComplete: ({ trials }) => trials.length > 0,
  },
  {
    id: 'setup-classes-built',
    phase: 'setup',
    title: 'Classes are built',
    detail: 'Elements, levels, and sections are ready to accept entries.',
    autoComplete: ({ classes }) => classes.length > 0,
  },
  {
    id: 'setup-judges-assigned',
    phase: 'setup',
    title: 'Judges are assigned',
    detail: 'The roster or class schedule shows who is judging what.',
    autoComplete: hasJudgesAssigned,
  },
  {
    id: 'setup-exhibitor-materials',
    phase: 'setup',
    title: 'Exhibitor materials are published',
    detail: 'Premium list or show page materials are available before entries open.',
    autoComplete: ({ show }) => hasPublishedExhibitorMaterials(show),
  },
];

export function getPhaseChecklistDefinitions(
  phase: LegacyShowWorkbenchPhase
): PhaseChecklistDefinition[] {
  return phaseChecklistDefinitions.filter(item => item.phase === phase);
}
