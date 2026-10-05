/**
 * Dogs and trials sync on their own schedule. A change to either after the queue loaded must
 * re-read it (the dog name / trial heading arrive late), with no Refresh button to recover it.
 */
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { getClassesWithWaitlistCounts, getWaitlistByClass } from '@/services/database/waitlists';
import WaitlistManagementPage from '../index';

const { listeners, fakeTable } = vi.hoisted(() => {
  const listeners = { byTable: {} as Record<string, Array<() => void>> };
  const fakeTable = (name: string) => ({
    subscribe: (cb: () => void) => {
      (listeners.byTable[name] ??= []).push(cb);
      return () => undefined;
    },
  });
  return { listeners, fakeTable };
});
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: fakeTable('dogs'),
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: fakeTable('trials'),
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: fakeTable('entries'),
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: fakeTable('classes'),
}));
vi.mock('@/services/replication/ReplicatedWaitlistEntriesTable', () => ({
  replicatedWaitlistEntriesTable: fakeTable('waitlist'),
}));

vi.mock('@/services/database/waitlists', () => ({
  getClassesWithWaitlistCounts: vi.fn(),
  getWaitlistByClass: vi.fn(),
  promoteWaitlistEntry: vi.fn(),
  removeFromWaitlist: vi.fn(),
  sendWaitlistOfferMessage: vi.fn(),
}));
vi.mock('@/hooks/queries/useJudgeDayCapacity', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/queries/useJudgeDayCapacity')>()),
  useJudgeDayCapacity: () => ({ judgeDays: [], isPaused: false, error: null }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ hasRole: () => true }),
}));
vi.mock('@/components/shows/WaitListSettingsCard', () => ({
  WaitListSettingsCard: () => <div />,
}));

const classRow = (trial: { id: string; name: string; date: string } | null) => ({
  id: 'c1',
  name: 'Novice A',
  class_number: '1',
  max_entries: null,
  trial_id: 't1',
  trial,
  accepted_count: 1,
  waitlist_count: 1,
});
const queue = (dog: { id: string; name: string; call_name: string } | null) => ({
  data: [
    {
      id: 'w1',
      class_id: 'c1',
      dog_id: 'd1',
      exhibitor_id: 'e1',
      handler_id: null,
      joined_via: null,
      position: 1,
      status: 'waiting',
      offered_at: null,
      offer_expires_at: null,
      created_at: '2026-03-01T10:00:00Z',
      updated_at: '2026-03-01T10:00:00Z',
      dog,
      class: { id: 'c1', name: 'Novice A', class_number: '1', max_entries: null },
    },
  ],
  error: null,
});

describe('WaitlistManagementPage replica dependencies', () => {
  beforeEach(() => {
    listeners.byTable = {};
  });

  it('re-reads the queue when the dogs replica finishes syncing, so the name appears', async () => {
    vi.mocked(getClassesWithWaitlistCounts).mockResolvedValue({
      data: [classRow(null)],
      error: null,
    } as never);
    vi.mocked(getWaitlistByClass).mockResolvedValue(queue(null) as never);
    render(<WaitlistManagementPage showId="show-1" />);
    expect(await screen.findByText('Unknown Dog')).toBeInTheDocument();

    vi.mocked(getWaitlistByClass).mockResolvedValue(
      queue({ id: 'd1', name: 'Bella', call_name: 'Bella' }) as never
    );
    listeners.byTable.dogs!.forEach(cb => cb());

    expect(await screen.findByText('Bella')).toBeInTheDocument();
  });

  it('re-reads the classes when the trials replica finishes syncing, so the trial heading appears', async () => {
    vi.mocked(getClassesWithWaitlistCounts).mockResolvedValue({
      data: [classRow(null)],
      error: null,
    } as never);
    vi.mocked(getWaitlistByClass).mockResolvedValue(queue(null) as never);
    render(<WaitlistManagementPage showId="show-1" />);
    await screen.findByText('Unknown Dog');
    expect(screen.queryByText(/Trial 9/)).not.toBeInTheDocument();

    vi.mocked(getClassesWithWaitlistCounts).mockResolvedValue({
      data: [classRow({ id: 't1', name: 'Trial 9', date: '2026-10-10' })],
      error: null,
    } as never);
    listeners.byTable.trials!.forEach(cb => cb());

    await waitFor(() => expect(screen.getByText(/Trial 9/)).toBeInTheDocument());
  });
});
