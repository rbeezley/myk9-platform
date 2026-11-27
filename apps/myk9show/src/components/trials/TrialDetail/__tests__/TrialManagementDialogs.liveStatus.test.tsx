import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { replicatedTrialsTable } from '@/services/replication';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { TrialWithClasses } from '@/hooks/useTrialDetailData';
import type { Show } from '@/types/show-types';
import { useTrialStore } from '@/store/trialStore';
import { TrialManagementDialogs } from '../TrialManagementDialogs';

// MYK9-2450: another device closes the trial while this secretary has Edit Trial open. The
// host holds a SNAPSHOT taken when the action opened (useTrialRowActions), so a rename saved
// through the real dialog must not send the snapshot's old status or actual times.

vi.mock('@/services/replication', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/replication')>();
  return {
    ...actual,
    replicatedTrialsTable: {
      ...actual.replicatedTrialsTable,
      get: vi.fn(async () => ({ id: 'trial-1', showId: 'show-uuid-1234', _version: 1 })),
      updateTrial: vi.fn(async () => 'm1'),
    },
  };
});
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'u1' } }),
}));
vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => undefined }));

const snapshot = {
  id: 'trial-1',
  name: 'Saturday AM',
  showId: 'show-uuid-1234',
  showName: 'Darboshea',
  trialDate: '2026-10-10',
  trialNumber: '1',
  status: 'in_progress',
  timeStarted: '2026-10-10T14:00:00.000Z',
  plannedStartTime: '09:00 AM',
  eventNumber: '1',
  order: '1',
  timezone: 'America/Chicago',
  classes: [],
} as unknown as TrialWithClasses;

const closedElsewhere = {
  ...snapshot,
  status: 'completed',
  timeEnded: '2026-10-10T20:00:00.000Z',
} as unknown as TrialWithClasses;

const sentUpdates = () => vi.mocked(replicatedTrialsTable.updateTrial).mock.calls[0]?.[1];

function renderDialogs(opened: TrialWithClasses) {
  return render(
    <TrialManagementDialogs
      currentTrial={opened}
      parentShow={{ id: 'show-uuid-1234', organization: 'AKC' } as Show}
      initialAction="edit"
    />
  );
}

const save = () => screen.getAllByRole('button', { name: /save changes/i })[0]!;

describe('TrialManagementDialogs saving a trial closed by another device (MYK9-2450)', () => {
  beforeEach(() => {
    vi.mocked(replicatedTrialsTable.updateTrial).mockClear();
    useTrialStore.setState({ trials: [closedElsewhere as unknown as SyncableTrial] });
  });

  it('a rename sends the name and no status, actual times or stale-class switch', async () => {
    const { user } = renderDialogs(snapshot);
    await user.type(await screen.findByLabelText(/trial name/i), ' B');
    await user.click(save());

    await waitFor(() => expect(replicatedTrialsTable.updateTrial).toHaveBeenCalled());
    const sent = sentUpdates();
    expect(sent).toMatchObject({ name: 'Saturday AM B' });
    expect(sent).not.toHaveProperty('status');
    expect(sent).not.toHaveProperty('actualStartTime');
    expect(sent).not.toHaveProperty('actualEndTime');
    expect(sent).not.toHaveProperty('autoCompleteStaleClasses');
    expect(useTrialStore.getState().trials[0]).toMatchObject({
      status: 'completed',
      timeEnded: '2026-10-10T20:00:00.000Z',
    });
  });

  it('a status chosen in the form is still sent', async () => {
    useTrialStore.setState({ trials: [snapshot as unknown as SyncableTrial] });
    const { user } = renderDialogs(snapshot);
    await user.click(await screen.findByRole('combobox', { name: /status/i }));
    await user.click(await screen.findByRole('option', { name: /completed/i }));
    await user.click(save());

    await waitFor(() => expect(replicatedTrialsTable.updateTrial).toHaveBeenCalled());
    expect(sentUpdates()).toMatchObject({ status: 'completed' });
  });
});

describe('TrialManagementDialogs actual times are compared as the form shows them', () => {
  // 00:15 on 2026-10-11 in Chicago (CDT): the day AFTER the trial date.
  const pastMidnight = {
    ...snapshot,
    status: 'completed',
    timeEnded: '2026-10-11T05:15:00.000Z',
  } as unknown as TrialWithClasses;

  beforeEach(() => {
    vi.mocked(replicatedTrialsTable.updateTrial).mockClear();
    useTrialStore.setState({ trials: [pastMidnight as unknown as SyncableTrial] });
  });

  it('a finish recorded after midnight is not saved a day early by a rename', async () => {
    const { user } = renderDialogs(pastMidnight);
    await user.type(await screen.findByLabelText(/trial name/i), ' B');
    await user.click(save());

    await waitFor(() => expect(replicatedTrialsTable.updateTrial).toHaveBeenCalled());
    const sent = sentUpdates();
    expect(sent).toMatchObject({ name: 'Saturday AM B' });
    expect(sent).not.toHaveProperty('actualEndTime');
    expect(sent).not.toHaveProperty('actualStartTime');
  });

  it('a finish clock the secretary changes is sent', async () => {
    const { user } = renderDialogs(pastMidnight);
    await user.click(await screen.findByRole('tab', { name: /scheduling/i }));
    const finish = await screen.findByRole('textbox', { name: /actual finish/i });
    await user.clear(finish);
    await user.type(finish, '11:30 PM');
    await user.click(save());

    await waitFor(() => expect(replicatedTrialsTable.updateTrial).toHaveBeenCalled());
    expect(sentUpdates()).toHaveProperty('actualEndTime');
  });
});
