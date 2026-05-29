import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import ShowDeskPanel from '../ShowDeskPanel';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';

const mockMessageStore = vi.hoisted(() => ({
  getOrCreateThread: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
  createDatabaseError: (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
}));

vi.mock('@/services/database/day-of-operations', () => ({
  processMoveUp: vi.fn(),
}));

vi.mock('@/services/database/entries/lifecycle', () => ({
  restoreEntryStatus: vi.fn(),
  scratchEntryDayOf: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    updateClass: vi.fn(),
  },
}));

vi.mock('@/store/messageStore', () => ({
  useMessageStore: (selector: (state: typeof mockMessageStore) => unknown) =>
    selector(mockMessageStore),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  clubName: 'Calm Canine Club',
  organization: 'AKC',
  startDate: '2026-06-12',
  endDate: '2026-06-14',
} as Show;

const futureTrial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  trialDate: '2026-06-12',
  trialNumber: '1',
  timezone: 'America/New_York',
  status: 'Not Started',
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced',
} as SyncableTrial;

describe('ShowDeskPanel', () => {
  it('uses scopeNow for status summary attention counts', () => {
    render(
      <ShowDeskPanel
        show={show}
        trials={[futureTrial]}
        classes={[
          {
            id: 'class-needs-signature',
            trialId: 'trial-1',
            name: 'Container Novice A',
            status: 'Complete',
          },
        ]}
        entries={[
          {
            id: 'entry-needs-signature',
            class_id: 'class-needs-signature',
            is_scored: true,
          },
        ]}
        canManageShow
        scopeNow={new Date('2026-05-28T15:00:00.000Z')}
      />
    );

    const status = screen.getByRole('region', { name: /show status/i });
    expect(within(status).getByTestId('show-desk-status-pill')).toHaveTextContent(
      'Show in progress'
    );
    expect(within(status).getByText('1 of 1 classes complete')).toBeInTheDocument();
    expect(within(status).queryByText(/attention/i)).not.toBeInTheDocument();
  });
});
