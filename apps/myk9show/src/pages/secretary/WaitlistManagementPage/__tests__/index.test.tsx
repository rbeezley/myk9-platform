/**
 * MYK9-795: the page's bespoke search box was replaced by the shared `ListFilterBar`.
 * MYK9-1004: "View Wait List" on a judge-day lists every waiting dog across the judge-day's
 * classes (grouped by class, join order) with the judge-day card's own numbers, and the tab,
 * already scoped to one show, no longer asks for a show or a class.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import type { JudgeDayCapacity } from '@/types/waitlist-types';
import WaitlistManagementPage from '../index';

const state = vi.hoisted(() => ({ hasRole: true }));

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
  getWaitlistByClass: vi.fn(async (classId: string) => ({
    data:
      {
        c1: [
          h.entry('w2', 'c1', 'Novice A', 2, 'Rexy'),
          h.entry('w1', 'c1', 'Novice A', 1, 'Bella'),
        ],
        c2: [h.entry('w3', 'c2', 'Novice B', 1, 'Tera')],
        c3: [h.entry('w4', 'c3', 'Master', 1, 'Otherjudge')],
      }[classId] ?? [],
    error: null,
  })),
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
});
