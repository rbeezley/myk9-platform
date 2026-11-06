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

describe('Continue on Results with the checklist collapsed (MYK9-1620)', () => {
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
    const disclosure = screen.getByTestId('class-checklist-disclosure');
    const link = screen.getByRole('link', { name: /Continue on Results/ });
    expect(link).toBeInTheDocument();
    expect(disclosure.contains(link)).toBe(false);
  });
});

describe('unused print tracking and checklist on the real cockpit shape (MYK9-1620)', () => {
  it('shows no strip, no "Not confirmed printed", no "Not done" and keeps Print and the checklist reachable', () => {
    renderCockpit({ printTrackingInUse: false, checklistInUse: false });

    expect(screen.queryByTestId('class-checklist-strip')).toBeNull();
    expect(screen.queryByText(/steps done/)).toBeNull();
    expect(screen.queryByText('Not confirmed printed')).toBeNull();
    expect(screen.queryByText('Not done')).toBeNull();

    const disclosure = screen.getByTestId('class-checklist-disclosure') as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(within(disclosure).getByText('Class checklist')).toBeInTheDocument();
    // The Print button for the sheet is still in the checklist.
    expect(within(disclosure).getByRole('button', { name: 'Print' })).toBeInTheDocument();
  });

  it('shows the strip on every class, the status text and an open checklist once in use', () => {
    renderCockpit({ printTrackingInUse: true, checklistInUse: true });

    expect(screen.getAllByTestId('class-checklist-strip')).toHaveLength(2);
    expect(screen.getAllByText(/of 7 steps done/)).toHaveLength(2);
    expect(screen.getByText('Not confirmed printed')).toBeInTheDocument();
    expect(screen.queryByTestId('class-checklist-disclosure')).toBeNull();
    expect(screen.getByRole('region', { name: 'Class checklist' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument();
  });
});
