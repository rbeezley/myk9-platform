/**
 * MYK9-795: the page's bespoke search box was replaced by the shared `ListFilterBar`.
 * MYK9-1004: "View Wait List" on a judge-day lists every waiting dog across the judge-day's
 * classes (grouped by class, join order) with the judge-day card's own numbers, and the tab,
 * already scoped to one show, no longer asks for a show or a class.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, createTestQueryClient } from '@/test/utils/testUtils';
import type { JudgeDayCapacity } from '@/types/waitlist-types';
import WaitlistManagementPage from '../index';

const state = vi.hoisted(() => ({
  hasRole: true,
  // A pending read for class c3 (Judge Two's day), settled by the test.
  holdC3: null as null | { resolve: () => void },
  failNextRead: false,
  replicaListeners: [] as Array<() => void>,
}));

const h = vi.hoisted(() => ({
  cls: (id: string, name: string, number: string, waiting: number, entered: number) => ({
    id,
    name,
    class_number: number,
    max_entries: null,
    trial_id: 't1',
    trial: { id: 't1', name: 'Trial 1', date: '2026-10-10' },
    accepted_count: entered,
    waitlist_count: waiting,
  }),
  entry: (id: string, classId: string, className: string, position: number, dog: string) => ({
    id,
    class_id: classId,
    dog_id: `dog-${id}`,
    exhibitor_id: 'ex1',
    handler_id: null,
    joined_via: null,
    position,
    status: 'waiting',
    offered_at: null,
    offer_expires_at: null,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
    dog: { id: `dog-${id}`, name: dog, call_name: dog },
    class: { id: classId, name: className, class_number: null, max_entries: null },
  }),
}));

vi.mock('@/services/database/waitlists', () => ({
  getClassesWithWaitlistCounts: vi.fn().mockResolvedValue({
    data: [
      h.cls('c1', 'Novice A', '1', 2, 2),
      h.cls('c2', 'Novice B', '2', 1, 1),
      h.cls('c3', 'Master', '3', 1, 0),
    ],
    error: null,
  }),
  // Deliberately returned out of order: the page must show join order itself.
  getWaitlistOffersByClass: vi.fn().mockResolvedValue({ data: [], error: null }),
  getWaitlistByClass: vi.fn(async (classId: string) => {
    if (state.failNextRead) {
      state.failNextRead = false;
      return { data: [], error: new Error('replica unavailable') };
    }
    if (classId === 'c3' && state.holdC3) {
      await new Promise<void>(resolve => {
        state.holdC3 = { resolve };
      });
    }
    return {
      data:
        {
          c1: [
            h.entry('w2', 'c1', 'Novice A', 2, 'Rexy'),
            h.entry('w1', 'c1', 'Novice A', 1, 'Bella'),
          ],
          c2: [h.entry('w3', 'c2', 'Novice B', 1, 'Tera')],
          c3: [h.entry('w4', 'c3', 'Master', 1, 'Otherjudge')],
          c4: [h.entry('w5', 'c4', 'Novice A', 1, 'Zed')],
        }[classId] ?? [],
      error: null,
    };
  }),
  promoteWaitlistEntry: vi.fn(),
  removeFromWaitlist: vi.fn(),
  sendWaitlistOfferMessage: vi.fn(),
}));

const judgeDay = (over: Partial<JudgeDayCapacity>): JudgeDayCapacity => ({
  judgeId: 'j1',
  judgeName: 'Judge One',
  showDate: '2026-10-10',
  capacity: 3,
  confirmedCount: 3,
  waitlistCount: 3,
  mailInReserved: 0,
  availableSpots: 0,
  classIds: ['c1', 'c2'],
  classNames: ['Novice A', 'Novice B'],
  ...over,
});

vi.mock('@/hooks/queries/useJudgeDayCapacity', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/queries/useJudgeDayCapacity')>()),
  useJudgeDayCapacity: () => ({
    judgeDays: [
      judgeDay({}),
      judgeDay({
        judgeId: 'j2',
        judgeName: 'Judge Two',
        capacity: 10,
        confirmedCount: 0,
        waitlistCount: 1,
        availableSpots: 10,
        classIds: ['c3'],
        classNames: ['Master'],
      }),
    ],
  }),
}));

vi.mock('@/services/replication/ReplicatedWaitlistEntriesTable', () => ({
  replicatedWaitlistEntriesTable: {
    subscribe: (cb: () => void) => {
      state.replicaListeners.push(cb);
      return () => undefined;
    },
  },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { subscribe: () => () => undefined },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { subscribe: () => () => undefined },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ hasRole: () => state.hasRole }),
}));

vi.mock('@/components/shows/WaitListSettingsCard', () => ({
  WaitListSettingsCard: ({ showId }: { showId: string }) => (
    <div data-testid="waitlist-settings-card">settings for {showId}</div>
  ),
}));

const viewWaitList = (judgeName: string) => {
  const card = screen.getByText(judgeName).closest('[data-slot="card"], .rounded-xl, div.border');
  const button = within(card as HTMLElement).getByRole('button', { name: 'View Wait List' });
  fireEvent.click(button);
};

describe('WaitlistManagementPage', () => {
  beforeEach(() => {
    state.hasRole = true;
    state.holdC3 = null;
    state.failNextRead = false;
    state.replicaListeners = [];
  });

  it('shows every waiting dog in the show, grouped by class, before any judge-day is chosen', async () => {
    render(<WaitlistManagementPage showId="show-1" />);
    expect(await screen.findByText('Bella')).toBeInTheDocument();
    expect(screen.getByText('Otherjudge')).toBeInTheDocument();
    expect(screen.getByText('Tera')).toBeInTheDocument();
  });

  // MYK9-1004: it used to open only the judge-day's FIRST class and show that class's (unlimited)
  // numbers under a Full 3/3 card.
  it('View Wait List lists the dogs of every class of the judge-day, grouped, in join order', async () => {
    render(<WaitlistManagementPage showId="show-1" />);
    await screen.findByText('Otherjudge');

    viewWaitList('Judge One');

    await waitFor(() => expect(screen.queryByText('Otherjudge')).not.toBeInTheDocument());
    await screen.findByText('Tera');
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map(h => h.textContent ?? '')
      .filter(t => /Novice/.test(t));
    expect(headings.map(h => h.replace(/\s+/g, ' ').trim())).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Novice A'),
        expect.stringContaining('Novice B'),
      ])
    );
    // Join order within a class: Bella (#1) before Rexy (#2); Novice B's dog is there too.
    const text = document.body.textContent ?? '';
    expect(text.indexOf('Bella')).toBeGreaterThan(-1);
    expect(text.indexOf('Bella')).toBeLessThan(text.indexOf('Rexy'));
    expect(text.indexOf('Rexy')).toBeLessThan(text.indexOf('Tera'));
  });

  it("shows the judge-day numbers, not a class's, under the stat cards", async () => {
    render(<WaitlistManagementPage showId="show-1" />);
    await screen.findByText('Otherjudge');
    viewWaitList('Judge One');

    const entryLimit = (await screen.findByText('Entry Limit')).closest('div')!.parentElement!;
    expect(entryLimit).toHaveTextContent('3');
    expect(entryLimit).not.toHaveTextContent('∞');
    expect(screen.getByText('Entered').closest('div')!.parentElement).toHaveTextContent('3');
    expect(screen.getByText('Available').closest('div')!.parentElement).toHaveTextContent('0');
  });

  it('has no show or class selector, heading or Refresh button inside the tab', async () => {
    render(<WaitlistManagementPage showId="show-1" />);
    await screen.findByText('Bella');
    expect(screen.queryByText('Select Show and Class')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('Waitlist Management')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeInTheDocument();
  });

  it('"Show every class" returns to the whole show', async () => {
    render(<WaitlistManagementPage showId="show-1" />);
    await screen.findByText('Otherjudge');
    viewWaitList('Judge One');
    await waitFor(() => expect(screen.queryByText('Otherjudge')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Show every class' }));
    expect(await screen.findByText('Otherjudge')).toBeInTheDocument();
  });

  it('narrows the queues through the shared ListFilterBar search', async () => {
    render(<WaitlistManagementPage showId="show-1" />);
    await screen.findByText('Bella');

    fireEvent.change(screen.getByPlaceholderText('Search by dog...'), {
      target: { value: 'tera' },
    });

    await waitFor(() => expect(screen.queryByText('Bella')).not.toBeInTheDocument());
    expect(screen.getByText('Tera')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 4 dogs.');
  });

  // MYK9-999: the settings are reachable from the Waitlist tab, scoped to the tab's show.
  it('offers Wait List Settings from the tab, for the show the tab was opened for', async () => {
    render(<WaitlistManagementPage showId="show-1" />);
    await screen.findByText('Bella');
    expect(
      screen.getByText(/Wait list settings: automatic offers, judge-day capacity, offer window/)
    ).toBeVisible();
    expect(screen.getByTestId('waitlist-settings-card')).toHaveTextContent('settings for show-1');
  });

  it('is closed to a user without a secretary role', () => {
    state.hasRole = false;
    render(<WaitlistManagementPage showId="show-1" />);
    expect(screen.getByText('Access Restricted')).toBeInTheDocument();
  });

  // Codex P2: switching judge-days kept the previous day's dogs on screen, actionable, until the
  // new read finished (or forever if it failed).
  it("drops the previous judge-day's dogs while the next judge-day is still loading", async () => {
    render(<WaitlistManagementPage showId="show-1" />);
    await screen.findByText('Otherjudge');
    viewWaitList('Judge One');
    await waitFor(() => expect(screen.queryByText('Otherjudge')).not.toBeInTheDocument());
    expect(await screen.findByText('Bella')).toBeInTheDocument();

    state.holdC3 = { resolve: () => undefined };
    viewWaitList('Judge Two');

    await waitFor(() =>
      expect(screen.getByText('Wait list for Judge Two,', { exact: false })).toBeInTheDocument()
    );
    expect(screen.queryByText('Bella')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /offer spot|remove/i })).not.toBeInTheDocument();

    state.holdC3!.resolve();
    expect(await screen.findByText('Otherjudge')).toBeInTheDocument();
  });

  it('shows a failed read with a Try again that recovers', async () => {
    state.failNextRead = true;
    render(<WaitlistManagementPage showId="show-1" />);
    expect(await screen.findByText(/Failed to load waitlist/)).toBeInTheDocument();
    expect(screen.queryByText('Bella')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Bella')).toBeInTheDocument();
  });

  it('re-reads the queues when the replica reports a change', async () => {
    const { getWaitlistByClass } = await import('@/services/database/waitlists');
    render(<WaitlistManagementPage showId="show-1" />);
    await screen.findByText('Bella');
    const before = vi.mocked(getWaitlistByClass).mock.calls.length;

    state.replicaListeners.forEach(cb => cb());

    await waitFor(() =>
      expect(vi.mocked(getWaitlistByClass).mock.calls.length).toBeGreaterThan(before)
    );
  });

  // Codex round 2: a mounted tab handed another show kept the old show's rows, actionable.
  it("hides the old show's rows at once when the show changes, and while the new read fails", async () => {
    const { getClassesWithWaitlistCounts } = await import('@/services/database/waitlists');
    const { rerender } = render(<WaitlistManagementPage showId="show-1" />);
    expect(await screen.findByText('Bella')).toBeInTheDocument();

    vi.mocked(getClassesWithWaitlistCounts).mockReturnValueOnce(new Promise(() => undefined));
    rerender(<WaitlistManagementPage showId="show-2" />);
    expect(screen.queryByText('Bella')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /offer spot|remove/i })).not.toBeInTheDocument();

    vi.mocked(getClassesWithWaitlistCounts).mockResolvedValueOnce({
      data: [],
      error: new Error('down'),
    } as never);
    rerender(<WaitlistManagementPage showId="show-3" />);
    expect(await screen.findByText(/Failed to load classes/)).toBeInTheDocument();
    expect(screen.queryByText('Bella')).not.toBeInTheDocument();
  });

  it('re-reads the judge-day capacity cards when the replica reports a change', async () => {
    const { judgeDayCapacityKey } = await import('@/hooks/queries/useJudgeDayCapacity');
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    render(<WaitlistManagementPage showId="show-1" />, { queryClient });
    await screen.findByText('Bella');

    state.replicaListeners.forEach(cb => cb());

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: judgeDayCapacityKey('show-1') })
    );
  });

  // Codex round 3: a failed removal's message must not outlive "Try again" or the show.
  async function failARemoval() {
    const { removeFromWaitlist } = await import('@/services/database/waitlists');
    vi.mocked(removeFromWaitlist).mockResolvedValueOnce({
      data: null,
      error: new Error('nope'),
    } as never);
    const view = render(<WaitlistManagementPage showId="show-1" />);
    await screen.findByText('Bella');
    fireEvent.click(screen.getAllByRole('button', { name: /^remove$/i })[0]!);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^remove$/i }));
    expect(await screen.findByText(/Failed to remove from waitlist/)).toBeInTheDocument();
    return view;
  }

  it('Try again clears a failed removal message', async () => {
    await failARemoval();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.queryByText(/Failed to remove from waitlist/)).not.toBeInTheDocument()
    );
  });

  it('a failed removal message does not follow the tab to another show', async () => {
    const { rerender } = await failARemoval();
    rerender(<WaitlistManagementPage showId="show-2" />);
    expect(screen.queryByText(/Failed to remove from waitlist/)).not.toBeInTheDocument();
  });

  it('tells apart same-named classes in different trials by trial name and date', async () => {
    const { getClassesWithWaitlistCounts } = await import('@/services/database/waitlists');
    vi.mocked(getClassesWithWaitlistCounts).mockResolvedValueOnce({
      data: [
        h.cls('c1', 'Novice A', '1', 2, 2),
        {
          ...h.cls('c4', 'Novice A', '1', 1, 0),
          trial_id: 't2',
          trial: { id: 't2', name: 'Trial 2', date: '2026-10-11' },
        },
      ],
      error: null,
    } as never);
    render(<WaitlistManagementPage showId="show-1" />);
    expect(await screen.findByText('Trial 1 · Sat, Oct 10, 2026')).toBeInTheDocument();
    expect(screen.getByText('Trial 2 · Sun, Oct 11, 2026')).toBeInTheDocument();
  });

  // docs/INTENT.md: 44px floor; Button `sm` (32px) is for dense grids and never for a primary or
  // destructive action or the only route to one.
  it('keeps every action on the 44px touch floor', async () => {
    state.failNextRead = true;
    render(<WaitlistManagementPage showId="show-1" />);
    const tryAgain = await screen.findByRole('button', { name: 'Try again' });
    fireEvent.click(tryAgain);
    await screen.findByText('Bella');
    viewWaitList('Judge One');
    const showEvery = await screen.findByRole('button', { name: 'Show every class' });

    const rowActions = await screen.findAllByRole('button', { name: /^(offer spot|remove)$/i });
    expect(rowActions.length).toBeGreaterThan(0);
    for (const button of [tryAgain, showEvery, ...rowActions]) {
      expect(button.className).toContain('h-11');
      expect(button.className).not.toContain('h-8');
    }
  });
});
