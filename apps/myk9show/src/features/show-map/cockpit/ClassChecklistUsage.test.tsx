import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';

import { buildSecretaryCockpitModel } from './secretaryCockpitModel';
import { SecretaryCockpitFocusedClass } from './SecretaryCockpitFocusedClass';
import { SecretaryCockpitSchedule } from './SecretaryCockpitSchedule';
import type { SecretaryCockpitSnapshot } from './secretaryCockpitTypes';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1', email: 'secretary@example.com' } }),
}));
vi.mock('@/services/replication', () => ({
  replicatedPaperworkPrintsTable: { confirmPrinted: vi.fn(), voidPrint: vi.fn() },
}));
vi.mock('@/lib/undoToast', () => ({ showUndoToast: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/show-day/classTimingMutations', () => ({
  setRevisedExpectedStart: vi.fn(async () => undefined),
}));
vi.mock('@/features/show-workbench/workbenchAnnouncementPost', () => ({
  useWorkbenchAnnouncementPost: () => ({ postAnnouncement: vi.fn() }),
}));

function makeSnapshot(usage: {
  printTrackingInUse: boolean;
  checklistInUse: boolean;
}): SecretaryCockpitSnapshot {
  return {
    showId: 'show-1',
    timeZone: 'America/Chicago',
    registryId: 'AKC',
    now: new Date('2026-07-20T14:00:00.000Z'),
    ...usage,
    trials: [{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }],
    classes: ['class-1', 'class-2'].map((id, index) => ({
      id,
      trialId: 'trial-1',
      name: `Container Novice ${index + 1}`,
      classOrder: index,
      scheduledStart: '09:00',
      lifecycle: 'not-started' as const,
      entryCount: 8,
      scoredCount: 0,
      actions: [],
      attention: [],
      entryRows: [],
      paperwork: [
        {
          reportId: 'check-in-sheet',
          label: 'Check-in sheet',
          state: 'unconfirmed' as const,
          printHref: `/reports/check-in/${id}`,
        },
      ],
    })),
  };
}

function renderCockpit(usage: { printTrackingInUse: boolean; checklistInUse: boolean }) {
  const snapshot = makeSnapshot(usage);
  const model = buildSecretaryCockpitModel(snapshot, {
    statuses: [],
    focusedClassId: 'class-1',
  });
  return render(
    <>
      <SecretaryCockpitSchedule
        showId="show-1"
        model={model}
        sourceClasses={snapshot.classes}
        sourceTrials={snapshot.trials}
        filtered={false}
        onFocusClass={vi.fn()}
      />
      <SecretaryCockpitFocusedClass
        showId="show-1"
        focused={model.focusedClass}
        sourceClass={snapshot.classes[0]!}
        trial={snapshot.trials[0]!}
        attention={[]}
        timeZone="America/Chicago"
        canManageShow
        onCommand={vi.fn()}
      />
    </>
  );
}

describe('Continue on Results with the show not using the checklist yet (MYK9-1620)', () => {
  it('stays reachable on a complete class that never printed', () => {
    const snapshot = makeSnapshot({ printTrackingInUse: false, checklistInUse: false });
    const complete = { ...snapshot.classes[0]!, lifecycle: 'complete' as const };
    const model = buildSecretaryCockpitModel(
      { ...snapshot, classes: [complete] },
      { statuses: [], focusedClassId: 'class-1' }
    );
    render(
      <SecretaryCockpitFocusedClass
        showId="show-1"
        focused={model.focusedClass}
        sourceClass={complete}
        trial={snapshot.trials[0]!}
        attention={[]}
        timeZone="America/Chicago"
        canManageShow
        onCommand={vi.fn()}
      />
    );
    expect(screen.getByRole('link', { name: /Continue on Results/ })).toBeInTheDocument();
  });
});

describe('unused print tracking and checklist on the real cockpit shape (MYK9-1620)', () => {
  it('shows no "Not confirmed printed" but keeps the checklist expanded with its count (MYK9-1783)', () => {
    renderCockpit({ printTrackingInUse: false, checklistInUse: false });

    expect(screen.queryByText('Not confirmed printed')).toBeNull();
    expect(screen.queryByTestId('class-checklist-disclosure')).toBeNull();
    const region = screen.getByRole('region', { name: 'Class checklist' });
    expect(within(region).getByText(/0 of 7 done/)).toBeInTheDocument();
    expect(
      within(region).getByRole('button', { name: 'Check-in sheet, not done. Open print preview' })
    ).toBeInTheDocument();
  });

  it('shows the status text and an open checklist once in use', () => {
    renderCockpit({ printTrackingInUse: true, checklistInUse: true });

    // The row no longer draws the step strip (MYK9-1782); the class page holds the checklist.
    expect(screen.queryByTestId('class-checklist-strip')).toBeNull();
    expect(screen.queryByTestId('class-checklist-disclosure')).toBeNull();
    expect(screen.getByRole('region', { name: 'Class checklist' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Check-in sheet, not done. Open print preview' })
    ).toBeInTheDocument();
  });
});
