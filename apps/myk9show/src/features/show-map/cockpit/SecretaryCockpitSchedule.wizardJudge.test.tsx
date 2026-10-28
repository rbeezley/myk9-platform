import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildCreateShowPayload } from '@/pages/secretary/ShowCreationWizard/buildCreateShowPayload';
import type {
  WizardShowData,
  WizardTrial,
} from '@/pages/secretary/ShowCreationWizard/showCreationWizardTransformers';
import { replicatedToTrial, replicatedToTrialClass } from '@/store/trial-store-helpers';
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
    // The store hop is the real one (replicatedToTrial / replicatedToTrialClass). The last step
    // copies the judge fields the way ShowWorkbenchShowDeskPage's showClasses projection does
    // (name, judgeName and judgeId only; the rest is not needed to read the judge).
    trials: localEntities.trials.map(replicatedToTrial),
    classes: localEntities.classes.map(replicated => {
      const cls = replicatedToTrialClass(replicated);
      return {
        id: cls.id,
        name: `${cls.element} ${cls.level}`,
        judgeName: cls.judgeName || '',
        judgeId: cls.judgeId || undefined,
        trialId: replicated.trialId ?? replicated.trial_id ?? '',
      };
    }),
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

    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
    expect(screen.queryByText(/Judge not set/)).not.toBeInTheDocument();
  });
});
