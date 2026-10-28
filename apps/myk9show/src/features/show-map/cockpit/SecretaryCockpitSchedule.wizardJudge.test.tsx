import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildCreateShowPayload } from '@/pages/secretary/ShowCreationWizard/buildCreateShowPayload';
import type {
  WizardShowData,
  WizardTrial,
} from '@/pages/secretary/ShowCreationWizard/showCreationWizardTransformers';
import { render } from '@/test/utils/testUtils';
import { createWizardTrialView } from '@/utils/wizardTrialNames';
import { buildSecretaryCockpitSnapshot } from './buildSecretaryCockpitSnapshot';
import { buildSecretaryCockpitModel } from './secretaryCockpitModel';
import { SecretaryCockpitSchedule } from './SecretaryCockpitSchedule';
import type { ShowMapTree } from '../showMapTypes';

vi.mock('@/services/show-day/classTimingMutations', () => ({
  setRevisedExpectedStart: vi.fn(async () => undefined),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// MYK9-1382: after Review & Publish the cockpit read "Judge not set" on every class until a hard
// reload. The cockpit reads the judge only off the replicated class row the wizard seeds, so this
// runs the wizard's own output through the cockpit's builders and renders the schedule, rather
// than asserting the seeded fields in isolation (the payload unit tests already do that).
const wizardShow: WizardShowData = {
  name: 'Spring Scent Work',
  organization: 'AKC',
  startDate: '2026-06-01',
  endDate: '2026-06-01',
  location: 'Roseville, CA',
  clubId: 'aaaaaaaa-0000-4000-8000-000000000001',
  entryOpenDate: '2026-04-01',
  entryCloseDate: '2026-05-15',
  preEntryFee: 30,
  dayOfShowFee: 35,
  startingArmbandNumber: 100,
  officials: { secretary: ['sec-uuid'], chairman: [], steward: [] },
  judgeIds: ['judge-uuid-a'],
  acceptCheckPayments: true,
  acceptCashPayments: false,
  onlineEntriesEnabled: false,
  style: 'monogram',
};

const wizardTrial: WizardTrial = {
  id: 'wizard-trial-1',
  trialType: 'Scent Work',
  trialDate: '2026-06-01',
  startTimeDraft: '09:00 AM',
  eventNumber: 'EVT-1',
  classes: [
    {
      templateId: 'tmpl-1',
      customizations: {
        element: 'Container',
        level: 'Novice',
        section: 'A',
        className: 'NW1 Containers',
      },
      judgeId: 'judge-uuid-a',
    },
  ],
};

function renderScheduleFromWizard() {
  const trialView = createWizardTrialView(
    [{ id: wizardTrial.id, trialDate: wizardTrial.trialDate, nameOverride: undefined }],
    []
  );
  const { localEntities, showId } = buildCreateShowPayload(
    wizardShow,
    [wizardTrial],
    { 'judge-uuid-a': { name: 'Jane Smith', email: '', phone: '' } },
    new Map(),
    'published',
    trialView
  );
  const tree: ShowMapTree = {
    root: { id: `show:${showId}`, type: 'show', label: 'Show', childrenCount: 0 },
    nodesById: {},
    childIdsByParentId: {},
  };
  const snapshot = buildSecretaryCockpitSnapshot({
    showId,
    // ShowWorkbenchShowDeskPage projects the replica rows into these shapes the same way:
    // the judge name and id come straight off the class row, nothing else supplies them.
    trials: localEntities.trials.map((trial, index) => ({
      id: trial.id,
      showId,
      showName: wizardShow.name,
      name: trial.name,
      trialDate: wizardTrial.trialDate,
      trialNumber: String(index + 1),
      status: 'Upcoming' as const,
      order: String(index + 1),
      _version: 1,
      _lastModified: new Date(),
      _lastModifiedBy: 'user-1',
      _syncStatus: 'synced' as const,
    })),
    classes: localEntities.classes.map(cls => ({
      id: cls.id,
      trialId: cls.trialId ?? cls.trial_id ?? '',
      name: cls.name ?? '',
      judgeName: cls.judgeName || '',
      judgeId: cls.judgeId || undefined,
    })),
    tree,
    pendingSignals: [],
    returnTo: `/shows/${showId}/show-day`,
    now: new Date('2026-06-01T15:00:00.000Z'),
  });
  const model = buildSecretaryCockpitModel(snapshot, {
    filter: 'all',
    selectedDay: undefined,
    focusedClassId: undefined,
  });
  return render(
    <SecretaryCockpitSchedule
      showId={showId}
      model={model}
      sourceClasses={snapshot.classes}
      sourceTrials={snapshot.trials}
      filter="all"
      onFilterChange={vi.fn()}
      onFocusClass={vi.fn()}
    />
  );
}

describe('Secretary cockpit schedule right after the wizard creates a show', () => {
  it('names the judge the wizard assigned, never "Judge not set" (MYK9-1382)', () => {
    renderScheduleFromWizard();

    expect(screen.getByText(/NW1 Containers|Container/i)).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
    expect(screen.queryByText(/Judge not set/)).not.toBeInTheDocument();
  });
});
