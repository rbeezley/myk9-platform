import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ShowWorkbenchPhase } from '@/hooks/useActivePhase';
import { CLASS_STATUS, normalizeClassStatus } from '@myk9/core';

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
  phase: ShowWorkbenchPhase;
  title: string;
  detail: string;
  autoComplete: (context: PhaseChecklistContext) => boolean;
}

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function isClassComplete(status: string): boolean {
  return normalizeClassStatus(status) === CLASS_STATUS.COMPLETED;
}

function hasPublishedExhibitorMaterials(show: Show): boolean {
  return Boolean(show.publishedPremiumUrl || show.publishedPremiumAt || show.experienceIsPublished);
}

function hasJudgesAssigned(context: PhaseChecklistContext): boolean {
  if (context.judges.length > 0) return true;
  return context.classes.length > 0 && context.classes.every(cls => hasText(cls.judgeName));
}

function hasRunOrderTimes(classes: ShowWorkbenchClassSummary[]): boolean {
  return classes.length > 0 && classes.every(cls => hasText(cls.time));
}

function classesAreComplete(classes: ShowWorkbenchClassSummary[]): boolean {
  return classes.length > 0 && classes.every(cls => isClassComplete(cls.status));
}

function classesAreScored(classes: ShowWorkbenchClassSummary[]): boolean {
  return (
    classes.length > 0 &&
    classes.every(cls => cls.entryCount === 0 || cls.scoredCount >= cls.entryCount)
  );
}

// INTENT: Manual-only checks are local guidance for now, not audit records.
// Promote these to a server-backed checklist table only after real-user validation.
const manualOnly = () => false;

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
  {
    id: 'today-tools-ready',
    phase: 'today',
    title: 'Show Map is built',
    detail: 'Trials and classes are loaded so the desk can work from the map.',
    autoComplete: ({ trials, classes }) => trials.length > 0 && classes.length > 0,
  },
  {
    id: 'today-entries-loaded',
    phase: 'today',
    title: 'Entries are loaded',
    detail: 'The desk can find each dog before handling check-in or scratches.',
    autoComplete: ({ entries }) => entries.length > 0,
  },
  {
    id: 'today-run-order-ready',
    phase: 'today',
    title: 'Run order has class times',
    detail: 'Classes have start times so staff can see what should be running.',
    autoComplete: ({ classes }) => hasRunOrderTimes(classes),
  },
  {
    id: 'today-ring-work-started',
    phase: 'today',
    title: 'Ring work has started',
    detail: 'At least one class is in progress or already completed.',
    autoComplete: ({ classes }) =>
      classes.some(cls => {
        const status = normalizeClassStatus(cls.status);
        return status === CLASS_STATUS.IN_PROGRESS || status === CLASS_STATUS.COMPLETED;
      }),
  },
  {
    id: 'today-attention-reviewed',
    phase: 'today',
    title: 'Attention queue has been reviewed',
    detail: 'Use the priority queue and Show Map attention lens before closing the day.',
    autoComplete: manualOnly,
  },
  {
    id: 'wrap-classes-complete',
    phase: 'wrap-up',
    title: 'Classes are complete',
    detail: 'Every scheduled class is marked complete before final reports are prepared.',
    autoComplete: ({ classes }) => classesAreComplete(classes),
  },
  {
    id: 'wrap-results-scored',
    phase: 'wrap-up',
    title: 'Scores are accounted for',
    detail: 'Completed classes have scored counts matching their entry counts.',
    autoComplete: ({ classes }) => classesAreComplete(classes) && classesAreScored(classes),
  },
  {
    id: 'wrap-results-reviewed',
    phase: 'wrap-up',
    title: 'Results are reviewed',
    detail: 'Open Results Control and confirm placements before publishing or filing.',
    autoComplete: manualOnly,
  },
  {
    id: 'wrap-reports-printed',
    phase: 'wrap-up',
    title: 'Reports are printed or exported',
    detail: 'Judge certification, secretary reports, and labels are ready for records.',
    autoComplete: manualOnly,
  },
  {
    id: 'wrap-submission-ready',
    phase: 'wrap-up',
    title: 'Submission packet is ready',
    detail: 'Final files are ready for registry submission from the closeout tools.',
    autoComplete: manualOnly,
  },
];

export function getPhaseChecklistDefinitions(
  phase: ShowWorkbenchPhase
): PhaseChecklistDefinition[] {
  return phaseChecklistDefinitions.filter(item => item.phase === phase);
}
