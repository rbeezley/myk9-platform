import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { render, createTestQueryClient } from '@/test/utils/testUtils';
import { ExhibitorClassCallout } from './ExhibitorClassCallout';
import { WhereToBe } from '@/components/shows/tabs/WhereToBe';
import type { EnrichedShowEntry } from '@/hooks/useShowEntriesForUser';
import type { MyClassEntry } from './useMyEntriesInClass';

// MYK9-995: the class callout and "Where to be" show the server's place in
// line, and fall back to the dog's state whenever that answer is not current.

const rpc = vi.fn();
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'auth-user-1' } }),
}));
let online = true;
vi.mock('@/hooks/useNetworkStatus', () => ({ useIsOnline: () => online }));
vi.mock('./useMyEntriesInClass', () => ({ useMyEntriesInClass: vi.fn() }));

import { useMyEntriesInClass } from './useMyEntriesInClass';

function classEntry(overrides: Partial<MyClassEntry> = {}): MyClassEntry {
  return {
    entryId: 'e1',
    dogId: 'd1',
    dogName: 'Maggie',
    armband: '101',
    runOrder: 31,
    queue: { kind: 'waiting-unknown' },
    hasResult: false,
    ...overrides,
  };
}

function showMyEntries(entries: MyClassEntry[]) {
  vi.mocked(useMyEntriesInClass).mockReturnValue({ myEntries: entries, isAfterClass: false });
}

function answer(rows: { entry_id: string; place: number | null }[]) {
  rpc.mockResolvedValue({ data: rows, error: null });
}

describe('ExhibitorClassCallout with a server place in line', () => {
  beforeEach(() => {
    rpc.mockReset();
    online = true;
    onlineManager.setOnline(true);
  });
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('says "Next up" when the server counts the dog first in line', async () => {
    showMyEntries([classEntry()]);
    answer([{ entry_id: 'e1', place: 1 }]);
    render(<ExhibitorClassCallout classId="c1" />);
    expect(await screen.findByText('Next up')).toBeInTheDocument();
    expect(screen.queryByText(/ahead/)).not.toBeInTheDocument();
    expect(screen.queryByText(/31/)).not.toBeInTheDocument();
  });

  it('says "3rd up" and "2 dogs ahead", and no wait estimate', async () => {
    showMyEntries([classEntry()]);
    answer([{ entry_id: 'e1', place: 3 }]);
    render(<ExhibitorClassCallout classId="c1" />);
    expect(await screen.findByText('3rd up')).toBeInTheDocument();
    expect(screen.getByText('2 dogs ahead')).toBeInTheDocument();
    expect(screen.queryByText(/min/)).not.toBeInTheDocument();
  });

  it('keeps "Waiting" while the answer is loading', async () => {
    showMyEntries([classEntry()]);
    rpc.mockReturnValue(new Promise(() => {}));
    render(<ExhibitorClassCallout classId="c1" />);
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });

  it('keeps "Waiting" offline, and never asks the server', async () => {
    online = false;
    showMyEntries([classEntry()]);
    answer([{ entry_id: 'e1', place: 1 }]);
    render(<ExhibitorClassCallout classId="c1" />);
    await new Promise(r => setTimeout(r, 20));
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.queryByText('Next up')).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('drops back to "Waiting" when a refresh pauses, instead of a stale "Next up"', async () => {
    showMyEntries([classEntry()]);
    answer([{ entry_id: 'e1', place: 1 }]);
    const queryClient = createTestQueryClient();
    render(<ExhibitorClassCallout classId="c1" />, { queryClient });
    expect(await screen.findByText('Next up')).toBeInTheDocument();

    act(() => onlineManager.setOnline(false));
    await act(async () => {
      void queryClient.refetchQueries({ queryKey: ['my-entry-queue-places'] });
    });
    await waitFor(() =>
      expect(
        queryClient.getQueryState(['my-entry-queue-places', 'auth-user-1', 'e1'])?.fetchStatus
      ).toBe('paused')
    );
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.queryByText('Next up')).not.toBeInTheDocument();
  });

  it("never lets a place override the dog's own in-ring state", async () => {
    showMyEntries([classEntry({ queue: { kind: 'in-ring' } })]);
    answer([{ entry_id: 'e1', place: 1 }]);
    render(<ExhibitorClassCallout classId="c1" />);
    expect(screen.getByText('In ring')).toBeInTheDocument();
    await new Promise(r => setTimeout(r, 20));
    expect(screen.queryByText('Next up')).not.toBeInTheDocument();
  });
});

describe('WhereToBe with a server place in line', () => {
  beforeEach(() => {
    rpc.mockReset();
    online = true;
  });

  function whereEntry(overrides: Partial<EnrichedShowEntry>): EnrichedShowEntry {
    return {
      entryId: 'e1',
      classId: 'c1',
      trialId: 't1',
      dogId: 'd1',
      dogName: 'Maggie',
      armband: '101',
      queue: { kind: 'waiting-unknown' },
      element: 'Container',
      level: 'Novice',
      section: 'A',
      classTitle: 'Container Novice A',
      trialDate: '2026-05-10',
      dayLabel: 'Sunday, May 10',
      trialName: 'Trial 1',
      startTime: '9:00 AM',
      judgeName: 'Smith',
      dogsAhead: 0,
      entryStatus: 'confirmed',
      paymentStatus: 'paid',
      hasResult: false,
      ...overrides,
    };
  }

  it('shows the counted place, and asks only about dogs that are waiting', async () => {
    answer([{ entry_id: 'e1', place: 2 }]);
    render(
      <WhereToBe
        entries={[
          whereEntry({}),
          whereEntry({ entryId: 'e2', dogName: 'Daisy', queue: { kind: 'in-ring' } }),
        ]}
        showId="show-1"
      />
    );
    expect(await screen.findByText('2nd up')).toBeInTheDocument();
    expect(screen.getByText('In ring')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('get_my_entry_queue_places', { p_entry_ids: ['e1'] });
  });
});
