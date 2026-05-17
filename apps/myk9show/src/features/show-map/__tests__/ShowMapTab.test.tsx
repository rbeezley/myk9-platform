import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import ShowMapTab from '../ShowMapTab';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';

const mockEq = vi.fn();
const mockUpdate = vi.fn();
const mockFrom = vi.fn();
const mockProcessMoveUp = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  createDatabaseError: (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
}));

vi.mock('@/services/database/day-of-operations', () => ({
  processMoveUp: (...args: unknown[]) => mockProcessMoveUp(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function makeSelectSingleChain(result: {
  data: Record<string, unknown> | null;
  error: Error | null;
}) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

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

describe('ShowMapTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ update: mockUpdate });
    mockProcessMoveUp.mockResolvedValue({
      data: { id: 'new-entry-1', class: { name: 'Exterior Advanced' } },
      error: null,
    });
  });

  it('renders counts, hierarchy, and capped entries', async () => {
    const entries = Array.from({ length: 27 }, (_, index) => ({
      id: `entry-${index}`,
      class_id: 'class-1',
      run_order: index,
      armband: String(index + 1),
      dog: { call_name: `Dog ${index}` },
    }));

    const { user } = render(
      <ShowMapTab
        show={show}
        trials={[trial]}
        classes={[
          {
            id: 'class-1',
            trialId: 'trial-1',
            name: 'Interior Novice A',
            status: 'In Progress',
          },
        ]}
        entries={entries}
        canManageShow
      />
    );

    expect(screen.getByText('Show Map')).toBeInTheDocument();
    expect(screen.getByText('Trials')).toBeInTheDocument();
    expect(screen.getByText('Classes')).toBeInTheDocument();
    expect(screen.getByText('Entries')).toBeInTheDocument();
    expect(screen.getByText('Need Attention')).toBeInTheDocument();
    expect(screen.getByText('Trial 1')).toBeInTheDocument();
    // Class rows are collapsed by default — the secretary opens the trial to drill in.
    expect(screen.queryByText('Interior Novice A')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /expand trial 1/i }));
    expect(screen.getByText('Interior Novice A')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /expand interior novice a/i }));

    expect(screen.getByText('2 more entries')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /score class/i })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /score entry/i })).not.toBeInTheDocument();
  });

  it('collapses class rows by default to avoid a wall of empty progress bars', () => {
    const trials = Array.from({ length: 4 }, (_, trialIndex) => ({
      ...trial,
      id: `trial-${trialIndex}`,
      trialNumber: String(trialIndex + 1),
    })) as SyncableTrial[];

    const classes = trials.flatMap(t =>
      Array.from({ length: 10 }, (_, classIndex) => ({
        id: `${t.id}-class-${classIndex}`,
        trialId: t.id,
        name: `Class ${trials.indexOf(t) * 10 + classIndex + 1}`,
        status: 'Not Started',
      }))
    );

    render(<ShowMapTab show={show} trials={trials} classes={classes} entries={[]} canManageShow />);

    // Trial rows render (root is expanded). Class rows do not (trials are collapsed).
    expect(screen.getByText('Trial 1')).toBeInTheDocument();
    expect(screen.getByText('Trial 4')).toBeInTheDocument();
    expect(screen.queryByText('Class 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Class 40')).not.toBeInTheDocument();
    // No class-level "Score Class" buttons should render either, since no
    // class rows are visible.
    expect(screen.queryByRole('button', { name: /score class/i })).not.toBeInTheDocument();
  });

  it('renders a calm empty state for shows without trials', () => {
    render(<ShowMapTab show={show} trials={[]} classes={[]} entries={[]} canManageShow />);

    expect(screen.getByText('No trials yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new trial/i })).toBeInTheDocument();
  });

  it('does not expose map content when canManageShow is false', () => {
    render(
      <ShowMapTab show={show} trials={[trial]} classes={[]} entries={[]} canManageShow={false} />
    );

    expect(screen.queryByText('Show Map')).not.toBeInTheDocument();
    expect(screen.getByText(/show map is only available to show staff/i)).toBeInTheDocument();
  });

  it('executes mark checked-in from the Priority Queue', async () => {
    const { user } = render(
      <ShowMapTab
        show={show}
        trials={[trial]}
        classes={[
          {
            id: 'class-1',
            trialId: 'trial-1',
            name: 'Interior Novice A',
            status: 'In Progress',
          },
        ]}
        entries={[
          {
            id: 'entry-1',
            class_id: 'class-1',
            armband: '12',
            dog: { call_name: 'Bella' },
            check_in_status: 'no-status',
          },
        ]}
        canManageShow
      />
    );

    const label = screen.getByText('Mark checked in');
    const queueRow = label.closest('div')?.parentElement?.parentElement;
    if (!(queueRow instanceof HTMLElement)) throw new Error('Expected priority queue row');

    await user.click(within(queueRow).getByRole('button', { name: /^open$/i }));

    expect(queueRow).toContainElement(label);
    expect(mockFrom).toHaveBeenCalledWith('entries');
    expect(mockUpdate).toHaveBeenCalledWith({ check_in_status: 'checked-in' });
    expect(mockEq).toHaveBeenCalledWith('id', 'entry-1');
  });

  it('opens the scratch / no-show dialog and writes pulled status', async () => {
    const { user } = render(
      <ShowMapTab
        show={show}
        trials={[trial]}
        classes={[
          {
            id: 'class-1',
            trialId: 'trial-1',
            name: 'Interior Novice A',
            status: 'In Progress',
          },
        ]}
        entries={[
          {
            id: 'entry-1',
            class_id: 'class-1',
            armband: '12',
            dog: { call_name: 'Bella' },
            check_in_status: 'checked-in',
          },
        ]}
        canManageShow
      />
    );

    await user.click(screen.getByRole('button', { name: /expand trial 1/i }));
    await user.click(screen.getByRole('button', { name: /expand interior novice a/i }));
    await user.click(screen.getByRole('button', { name: /actions for .*bella/i }));
    await user.click(await screen.findByRole('menuitem', { name: /scratch \/ no-show/i }));

    expect(screen.getByRole('dialog', { name: /mark scratch \/ no-show/i })).toBeInTheDocument();
    expect(screen.getByText(/refunds are not automatic/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/reason/i), 'Dog absent');
    await user.click(screen.getByRole('button', { name: /mark pulled/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          entry_status: 'scratched',
          check_in_status: 'pulled',
          withdrawal_reason: 'Dog absent',
          updated_at: expect.any(String),
        })
      );
    });
    expect(mockEq).toHaveBeenCalledWith('id', 'entry-1');
  });

  it('opens the move-up dialog and saves the move-up', async () => {
    const fetchChain = makeSelectSingleChain({
      data: {
        entry_status: 'checked-in',
        check_in_status: 'checked-in',
        special_requests: null,
      },
      error: null,
    });
    mockFrom.mockReset().mockReturnValueOnce(fetchChain);

    const { user } = render(
      <ShowMapTab
        show={show}
        trials={[trial]}
        classes={[
          {
            id: 'class-1',
            trialId: 'trial-1',
            name: 'Interior Novice A',
            status: 'In Progress',
          },
          {
            id: 'class-2',
            trialId: 'trial-1',
            name: 'Exterior Advanced',
            status: 'Not Started',
          },
        ]}
        entries={[
          {
            id: 'entry-1',
            class_id: 'class-1',
            armband: '12',
            dog: { call_name: 'Bella' },
            check_in_status: 'checked-in',
          },
        ]}
        canManageShow
      />
    );

    await user.click(screen.getByRole('button', { name: /expand trial 1/i }));
    await user.click(screen.getByRole('button', { name: /expand interior novice a/i }));
    await user.click(screen.getByRole('button', { name: /actions for .*bella/i }));
    await user.click(await screen.findByRole('menuitem', { name: /move up/i }));

    expect(screen.getByRole('dialog', { name: /move up entry/i })).toBeInTheDocument();

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /exterior advanced/i }));
    await user.type(screen.getByLabelText(/reason/i), 'Qualified today');
    await user.click(screen.getByRole('button', { name: /move entry/i }));

    await waitFor(() => {
      expect(mockProcessMoveUp).toHaveBeenCalledWith('entry-1', 'class-2', 'Qualified today');
    });
  });
});
