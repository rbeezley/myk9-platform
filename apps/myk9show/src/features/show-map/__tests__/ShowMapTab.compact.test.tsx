import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import ShowMapTab from '../ShowMapTab';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn() },
  createDatabaseError: (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
}));
vi.mock('@/services/database/day-of-operations', () => ({ processMoveUp: vi.fn() }));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { updateClass: vi.fn() },
}));
vi.mock('@/store/messageStore', () => ({
  useMessageStore: () => ({ getOrCreateThread: vi.fn(), sendMessage: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const show = { id: 'show-1', name: 'Spring Trial', clubName: 'Calm Canine Club' } as Show;
const trial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  trialDate: '2026-05-11',
  trialNumber: '1',
  status: 'In Progress',
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced',
} as SyncableTrial;

const classes = [
  { id: 'class-1', trialId: 'trial-1', name: 'Interior Novice A', status: 'In Progress' },
];

// INTENT: Regression guard for Phase B2a. In compact mode the adaptive header
// (rendered by the Show Desk parent) owns Guidance / Up Next / Running Now,
// so ShowMapTab MUST NOT render its own copies — duplicate surfaces would
// leak past the header and confuse the secretary.
describe('ShowMapTab compact mode', () => {
  it('hides internal Guidance, Up Next, and Running Now when compact=true', () => {
    render(
      <ShowMapTab
        show={show}
        trials={[trial]}
        classes={classes}
        entries={[
          {
            id: 'entry-1',
            class_id: 'class-1',
            dog: { call_name: 'Bella' },
            entry_status: 'submitted',
          },
        ]}
        canManageShow
        compact
      />
    );

    expect(screen.queryByRole('region', { name: /next best action/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /up next/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /running now/i })).not.toBeInTheDocument();
    // The tree, toolbar, and summary tiles still render — only the header-owned surfaces are hidden.
    expect(screen.getByText('Show Map')).toBeInTheDocument();
    expect(screen.getByText('Trial 1')).toBeInTheDocument();
  });

  it('still renders Guidance, Up Next, and Running Now when compact is omitted (legacy mounts)', () => {
    render(
      <ShowMapTab
        show={show}
        trials={[trial]}
        classes={classes}
        entries={[
          {
            id: 'entry-1',
            class_id: 'class-1',
            dog: { call_name: 'Bella' },
            entry_status: 'submitted',
          },
        ]}
        canManageShow
      />
    );

    expect(screen.getByRole('region', { name: /next best action/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /up next/i })).toBeInTheDocument();
  });
});
