import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';

import { render } from '@/test/utils/testUtils';
import { applyManualClassStatus } from '@/services/show-day/classStatusMutations';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';

import { SecretaryCockpitFocusedClass } from './SecretaryCockpitFocusedClass';
import type { SecretaryCockpitClassEntry } from './cockpitClassEntries';
import { queueFor } from './__tests__/queueFixture';
import type { FocusedClassModel, SecretaryCockpitClass } from './secretaryCockpitTypes';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1', email: 'secretary@example.com' } }),
}));
vi.mock('@/services/replication', () => ({
  replicatedPaperworkPrintsTable: { confirmPrinted: vi.fn(), voidPrint: vi.fn() },
}));
vi.mock('@/services/show-day/classStatusMutations', () => ({
  applyManualClassStatus: vi.fn(async () => undefined),
}));
vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: vi.fn(),
}));
vi.mock('@/lib/undoToast', () => ({ showUndoToast: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/features/show-workbench/workbenchAnnouncementPost', () => ({
  useWorkbenchAnnouncementPost: () => ({ postAnnouncement: vi.fn() }),
}));

const moss = fromPartial<SecretaryCockpitClassEntry>({
  nodeId: 'entry:e-1',
  queue: queueFor('entry:e-1', '101', 'waiting'),
  entryId: 'e-1',
  armband: '101',
  dogName: 'Moss',
  checkIn: { value: 'no-status', label: 'Not checked in', kind: 'neutral' },
  checkInValue: 'no-status',
  deskEditable: true,
  lockedReason: null,
  state: 'waiting',
  counted: true,
  notCheckedIn: true,
  place: 1,
  result: null,
});

const focusedClass = (id: string, name: string, overrides: Partial<FocusedClassModel> = {}) =>
  fromPartial<FocusedClassModel>({
    id,
    trialId: 'trial-1',
    name,
    timeLabel: '9:00 AM',
    scheduledStart: '9:00 AM',
    expectedStart: '9:00 AM',
    startedLabel: null,
    lifecycle: { evidence: 'recorded', value: 'in-progress' },
    progress: { evidence: 'computed', value: { completed: 0, total: 1 } },
    judgeName: null,
    attentionCount: 0,
    closeout: 'none',
    statusLine: { text: 'In progress', parts: ['In progress'] },
    printTrackingInUse: true,
    actualStart: { evidence: 'unknown', value: null },
    actualFinish: { evidence: 'unknown', value: null },
    paperwork: [],
    classWorkActions: [],
    entryRows: [],
    entries: [
      {
        ...moss,
        nodeId: `entry:${id}`,
        queue: queueFor(`entry:${id}`, '101', 'waiting'),
        entryId: `e-${id}`,
      },
    ],
    entriesHidden: 0,
    ...overrides,
  });

const sourceOf = (id: string, name: string, overrides: Partial<SecretaryCockpitClass> = {}) =>
  fromPartial<SecretaryCockpitClass>({
    id,
    trialId: 'trial-1',
    name,
    classOrder: 0,
    scheduledStart: '9:00 AM',
    lifecycle: 'in-progress',
    entryCount: 1,
    scoredCount: 0,
    attention: [],
    actions: [],
    paperwork: [],
    entryRows: [],
    ...overrides,
  });

const panel = (
  focused: FocusedClassModel,
  sourceClass: SecretaryCockpitClass,
  onRefreshEntries?: () => Promise<void>
) => (
  <SecretaryCockpitFocusedClass
    {...(onRefreshEntries && { onRefreshEntries })}
    showId="show-1"
    focused={focused}
    sourceClass={sourceClass}
    trial={{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }}
    attention={[]}
    timeZone="America/Chicago"
    canManageShow
    onCommand={vi.fn()}
  />
);

describe('SecretaryCockpitFocusedClass guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks before marking a class Complete when its entry counts are unknown (MYK9-1801)', async () => {
    render(
      panel(
        focusedClass('class-1', 'Container Novice', {
          progress: { evidence: 'unknown', value: null },
        }),
        sourceOf('class-1', 'Container Novice', { entryCount: null, scoredCount: null })
      )
    );
    // A submenu parks pointer-events: none on its parent while open, which user-event would refuse.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(
      screen.getByRole('button', { name: /^Status: .*Change status of Container Novice$/ })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Complete' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/^Entry data is unavailable/)).toBeInTheDocument();
    expect(applyManualClassStatus).not.toHaveBeenCalled();
  });

  it('does not carry a failed check-in alert over to the next class focused (MYK9-1803)', async () => {
    vi.mocked(updateReplicatedCheckInStatus).mockRejectedValue(new Error('offline queue full'));
    const { user, rerender } = render(
      panel(focusedClass('class-1', 'Container Novice'), sourceOf('class-1', 'Container Novice'))
    );
    await user.click(
      screen.getByRole('button', { name: 'Change check-in for Moss: Not checked in' })
    );
    const picker = await screen.findByRole('dialog');
    await user.click(within(picker).getByRole('button', { name: /^Checked-in/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/^Couldn't check in/));

    rerender(
      panel(focusedClass('class-2', 'Interior Novice'), sourceOf('class-2', 'Interior Novice'))
    );

    expect(screen.getByRole('heading', { name: 'Interior Novice' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a check-in whose re-read failed when the secretary looks at another class and comes back (MYK9-1803)', async () => {
    vi.mocked(updateReplicatedCheckInStatus).mockResolvedValue(null);
    const failedReRead = vi.fn().mockRejectedValue(new Error('Show entries not synced'));
    const first = () =>
      panel(
        focusedClass('class-1', 'Container Novice'),
        sourceOf('class-1', 'Container Novice'),
        failedReRead
      );
    const { user, rerender } = render(first());
    await user.click(
      screen.getByRole('button', { name: 'Change check-in for Moss: Not checked in' })
    );
    const picker = await screen.findByRole('dialog');
    await user.click(within(picker).getByRole('button', { name: /^Checked-in/ }));
    await waitFor(() => expect(failedReRead).toHaveBeenCalledTimes(1));
    const checkedIn = { name: 'Change check-in for Moss: Checked in' };
    expect(await screen.findByRole('button', checkedIn)).toBeInTheDocument();

    rerender(
      panel(
        focusedClass('class-2', 'Interior Novice'),
        sourceOf('class-2', 'Interior Novice'),
        failedReRead
      )
    );
    rerender(first());

    // The entries read still says "Not checked in"; the write that was stored is what shows.
    expect(screen.getByRole('button', checkedIn)).toBeInTheDocument();
  });
});
