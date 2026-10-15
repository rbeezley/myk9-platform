import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ExhibitorClassCallout } from './ExhibitorClassCallout';
import type { MyClassEntry } from './useMyEntriesInClass';

// MYK9-1195: the class page makes no place-in-line claim for a class on a
// future trial day, judged in the trial's own timezone (same rule as the
// show page's run schedule, MYK9-1173).

const rpc = vi.fn();
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'auth-user-1' } }),
}));
vi.mock('@/hooks/useNetworkStatus', () => ({ useIsOnline: () => true }));
vi.mock('./useMyEntriesInClass', () => ({ useMyEntriesInClass: vi.fn() }));

import { useMyEntriesInClass } from './useMyEntriesInClass';

const entry: MyClassEntry = {
  entryId: 'e1',
  dogId: 'd1',
  dogName: 'Maggie',
  armband: '101',
  runOrder: 1,
  queue: { kind: 'waiting-unknown' },
  hasResult: false,
};

function setup(props: { trialDate?: string; trialTimezone?: string }) {
  vi.mocked(useMyEntriesInClass).mockReturnValue({ myEntries: [entry], isAfterClass: false });
  rpc.mockResolvedValue({ data: [{ entry_id: 'e1', place: 3 }], error: null });
  render(<ExhibitorClassCallout classId="c1" {...props} />);
}

describe('ExhibitorClassCallout on a future trial day', () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('makes no place-in-line claim for a class on a later day', async () => {
    vi.setSystemTime(new Date('2026-10-17T15:00:00Z')); // Saturday
    setup({ trialDate: '2026-10-18', trialTimezone: 'America/Chicago' });
    expect(screen.getByText('Maggie')).toBeInTheDocument();
    expect(screen.getByText(/Armband/)).toBeInTheDocument();
    await Promise.resolve();
    expect(screen.queryByText('Next up')).not.toBeInTheDocument();
    expect(screen.queryByText(/3rd up|in line|ahead/)).not.toBeInTheDocument();
    expect(screen.queryByText('Waiting')).not.toBeInTheDocument();
  });

  it("still shows the place in line on the trial's own day", async () => {
    vi.setSystemTime(new Date('2026-10-18T15:00:00Z'));
    setup({ trialDate: '2026-10-18', trialTimezone: 'America/Chicago' });
    expect(await screen.findByText('3rd up')).toBeInTheDocument();
    expect(screen.getByText('2 dogs ahead')).toBeInTheDocument();
  });

  it('uses the trial zone: 04:30Z Oct 15 is still Oct 14 in Chicago, so Oct 15 is a future day', async () => {
    vi.setSystemTime(new Date('2026-10-15T04:30:00Z'));
    setup({ trialDate: '2026-10-15', trialTimezone: 'America/Chicago' });
    await Promise.resolve();
    expect(screen.queryByText(/up$|ahead|Waiting/)).not.toBeInTheDocument();
  });

  it('counter-check: in New York the same instant is already Oct 15, so the place shows', async () => {
    vi.setSystemTime(new Date('2026-10-15T04:30:00Z')); // 00:30 Oct 15 EDT
    setup({ trialDate: '2026-10-15', trialTimezone: 'America/New_York' });
    await waitFor(() => expect(screen.getByText('3rd up')).toBeInTheDocument());
  });

  it('with no resolved zone the old behaviour stays', async () => {
    vi.setSystemTime(new Date('2026-10-17T15:00:00Z'));
    setup({ trialDate: '2026-10-18' });
    expect(await screen.findByText('3rd up')).toBeInTheDocument();
  });
});
