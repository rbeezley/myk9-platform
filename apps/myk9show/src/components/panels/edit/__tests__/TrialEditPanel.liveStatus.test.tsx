import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { replicatedTrialsTable } from '@/services/replication';
import type { Trial } from '@/components/trials/types/trial.types';
import type { SyncableTrial } from '@/store/trial-store-types';
import { useTrialStore } from '@/store/trialStore';
import { TrialEditPanel } from '../TrialEditPanel';

// MYK9-2450: another device closes the trial while this secretary has Edit Trial open. A save
// that only renamed the trial must not send the old status or the old finish time.

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

const openedWith = {
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
} as unknown as Trial;

const closedElsewhere = {
  ...openedWith,
  status: 'completed',
  timeEnded: '2026-10-10T20:00:00.000Z',
} as unknown as Trial;

const sentUpdates = () => vi.mocked(replicatedTrialsTable.updateTrial).mock.calls[0]?.[1];

// The host's save: the live store row spread under the panel's data.
const hostSave = async (trialData: Partial<Trial>) => {
  const live = useTrialStore.getState().trials.find(t => t.id === 'trial-1');
  await useTrialStore.getState().updateTrial('trial-1', { ...live, ...trialData } as never, 'u1');
};

function renderOpenPanel() {
  const view = render(
    <TrialEditPanel
      open
      onClose={vi.fn()}
      trialId="trial-1"
      trialName="Saturday AM"
      initialTrialData={openedWith}
      organization="AKC"
      onSave={hostSave}
    />
  );
  const panel = (data: Partial<Trial>) => (
    <TrialEditPanel
      open
      onClose={vi.fn()}
      trialId="trial-1"
      trialName="Saturday AM"
      initialTrialData={data}
      organization="AKC"
      onSave={hostSave}
    />
  );
  return { ...view, panel };
}

describe('TrialEditPanel with the trial closed by another device (MYK9-2450)', () => {
  beforeEach(() => {
    vi.mocked(replicatedTrialsTable.updateTrial).mockClear();
    useTrialStore.setState({ trials: [openedWith as unknown as SyncableTrial] });
  });

  it('a rename saved after the close sends neither status nor actual times', async () => {
    const { user, rerender, panel } = renderOpenPanel();
    // The form holds an edit, so the new row does not re-seed it.
    await user.type(await screen.findByLabelText(/trial name/i), ' B');
    useTrialStore.setState({ trials: [closedElsewhere as unknown as SyncableTrial] });
    rerender(panel(closedElsewhere));
    await user.click(screen.getAllByRole('button', { name: /save changes/i })[0]!);

    await waitFor(() => expect(replicatedTrialsTable.updateTrial).toHaveBeenCalled());
    const sent = sentUpdates();
    expect(sent).toMatchObject({ name: 'Saturday AM B' });
    expect(sent).not.toHaveProperty('status');
    expect(sent).not.toHaveProperty('actualStartTime');
    expect(sent).not.toHaveProperty('actualEndTime');
    expect(useTrialStore.getState().trials[0]).toMatchObject({
      status: 'completed',
      timeEnded: '2026-10-10T20:00:00.000Z',
    });
  });

  it('a status chosen in the form is still sent', async () => {
    const { user } = renderOpenPanel();
    await user.click(await screen.findByRole('combobox', { name: /status/i }));
    await user.click(await screen.findByRole('option', { name: /completed/i }));
    await user.click(screen.getAllByRole('button', { name: /save changes/i })[0]!);

    await waitFor(() => expect(replicatedTrialsTable.updateTrial).toHaveBeenCalled());
    expect(sentUpdates()).toMatchObject({ status: 'completed' });
  });
});
