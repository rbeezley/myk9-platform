/**
 * MYK9-1046: one time-ordered list across dogs, a dog filter, ring conflicts in
 * words, and the saved-information notice. Place in line runs through the REAL
 * `useMyEntryQueuePlacesWithFreshness` and its settled logic (only the rpc
 * client, auth and the online flag are stubbed), so "offline" is the real
 * offline path rather than a mock that pre-blanks the places.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { AtShowMyEntriesToday } from './AtShowMyEntriesToday';
import type { AtShowEntryDetail } from './myAtShowEntryDetails.helpers';

const rpc = vi.hoisted(() => vi.fn());
const online = vi.hoisted(() => ({ current: true }));

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { rpc } }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useNetworkStatus', () => ({ useIsOnline: () => online.current }));
vi.mock('@/hooks/mutations/useCheckInMutation', () => ({
  useCheckInMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/notifications', () => ({ notifications: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/services/replication', () => ({ replicatedEntriesTable: { sync: vi.fn() } }));

function entry(overrides: Partial<AtShowEntryDetail> & { entryId: string }): AtShowEntryDetail {
  return {
    classId: 'class-a',
    dogName: 'Juni',
    dogKey: 'dog-juni',
    armband: '101',
    checkInStatus: 'checked-in',
    className: 'Container Novice',
    expectedStartLabel: '9:00 AM',
    isRevisedStart: false,
    hasRunOrder: true,
    isScored: false,
    resultStatus: null,
    resultTimeSeconds: null,
    resultFaults: null,
    isPreliminary: false,
    selfCheckinState: 'allowed',
    trialLabel: null,
    runOrder: 1,
    startTime: '9:00 AM',
    trialTimezone: 'America/Chicago',
    ...overrides,
  };
}

// Two dogs, three classes, deliberately handed over out of order.
const ENTRIES = [
  entry({
    entryId: 'rex-pm',
    dogName: 'Rex',
    dogKey: 'dog-rex',
    armband: '202',
    classId: 'c-pm',
    className: 'Interior Excellent',
    startTime: '1:30 PM',
    expectedStartLabel: '1:30 PM',
  }),
  entry({
    entryId: 'juni-pm',
    classId: 'c-pm',
    className: 'Interior Excellent',
    startTime: '1:30 PM',
    expectedStartLabel: '1:30 PM',
    runOrder: 2,
  }),
  entry({
    entryId: 'juni-am',
    classId: 'c-am',
    className: 'Container Novice',
    startTime: '9:00 AM',
  }),
];

function renderList(entries: AtShowEntryDetail[] = ENTRIES, loadFailed = false) {
  return render(
    <AtShowMyEntriesToday
      showId="show-1"
      entries={entries}
      isLoading={false}
      dataUpdatedAt={1}
      loadFailed={loadFailed}
      onRetry={vi.fn()}
      onSeeAllClasses={vi.fn()}
    />
  );
}

const rowIds = () =>
  screen.getAllByTestId(/^at-show-my-entry-(?!place|conflict)/).map(el => el.dataset.testid);

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [], error: null });
  online.current = true;
});

describe('AtShowMyEntriesToday — one ordered list (MYK9-1046)', () => {
  it('lists every dog in one time-ordered list, run queue inside a class', () => {
    renderList();
    expect(rowIds()).toEqual([
      'at-show-my-entry-juni-am',
      'at-show-my-entry-rex-pm', // run order 1 in the afternoon class
      'at-show-my-entry-juni-pm', // run order 2
    ]);
  });

  it('shows no dog filter for a single dog', () => {
    renderList([ENTRIES[2] as AtShowEntryDetail]);
    expect(screen.queryByRole('combobox', { name: /show: which dog/i })).not.toBeInTheDocument();
  });

  it('narrows to one dog with honest counts, and falls back to All when its rows vanish', async () => {
    const user = userEvent.setup();
    const view = renderList();
    const select = screen.getByRole('combobox', { name: /show: which dog/i });
    expect(select).toHaveTextContent('All dogs (3)');

    await user.click(select);
    expect(await screen.findByRole('option', { name: 'Juni (2)' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Rex (1)' }));
    expect(rowIds()).toEqual(['at-show-my-entry-rex-pm']);

    // Counts still describe the whole day.
    await user.click(screen.getByRole('combobox', { name: /show: which dog/i }));
    expect(await screen.findByRole('option', { name: 'Juni (2)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All dogs (3)' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    view.rerender(
      <AtShowMyEntriesToday
        showId="show-1"
        entries={ENTRIES.filter(item => item.dogKey === 'dog-juni')}
        isLoading={false}
        dataUpdatedAt={1}
        loadFailed={false}
        onRetry={vi.fn()}
        onSeeAllClasses={vi.fn()}
      />
    );
    expect(rowIds()).toEqual(['at-show-my-entry-juni-am', 'at-show-my-entry-juni-pm']);
  });

  it('keeps every check-in button name unique', () => {
    renderList(ENTRIES.map(item => ({ ...item, checkInStatus: 'no-status' as const })));
    const names = screen
      .getAllByRole('button', { name: /^Check in / })
      .map(b => b.getAttribute('aria-label'));
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
  });
});

describe('AtShowMyEntriesToday — ring conflict in words (MYK9-1046)', () => {
  const running = ENTRIES.map(item => ({ ...item, classStatus: 'in_progress' }));

  it('says what was found, calmly, with an icon and the words, when both server places are near', async () => {
    rpc.mockResolvedValue({
      data: [
        { entry_id: 'juni-am', place: 1 },
        { entry_id: 'rex-pm', place: 2 },
      ],
      error: null,
    });
    renderList(running);
    const row = await screen.findByTestId('at-show-my-entry-juni-am');
    const notice = await within(row).findByTestId('at-show-my-entry-conflict');
    expect(notice).toHaveTextContent(
      'Close to going in at more than one ring. Also near the front: Rex 1 away in Interior Excellent. The ring steward can help.'
    );
    expect(notice.querySelector('svg')).not.toBeNull();
    expect(notice.textContent).not.toMatch(/same time|two of your dogs/i);
  });

  it('does not warn when the server places the other dog 30th, though this account holds few rows', async () => {
    rpc.mockResolvedValue({
      data: [
        { entry_id: 'juni-am', place: 1 },
        { entry_id: 'rex-pm', place: 30 },
      ],
      error: null,
    });
    renderList(running);
    expect(await screen.findByText('30th up')).toBeInTheDocument();
    expect(screen.queryByTestId('at-show-my-entry-conflict')).not.toBeInTheDocument();
  });

  it('shows nothing offline, where no places are confirmed', () => {
    online.current = false;
    renderList(running);
    expect(screen.queryByTestId('at-show-my-entry-conflict')).not.toBeInTheDocument();
  });
});

describe('AtShowMyEntriesToday — saved information (MYK9-1046)', () => {
  const NOTICE = 'Showing saved information. Check-in and running order may be out of date.';

  it('online with a confirmed answer: the place carries its freshness and no notice shows', async () => {
    rpc.mockResolvedValue({ data: [{ entry_id: 'juni-am', place: 4 }], error: null });
    renderList();
    expect(await screen.findByText('4th up')).toBeInTheDocument();
    expect(screen.getByText(/^updated \d{1,2}:\d{2} (AM|PM)$/)).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it('offline: renders the cached list with the notice, and never a place number', async () => {
    online.current = false;
    renderList();
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    expect(rowIds()).toHaveLength(3);
    expect(screen.getAllByText('Waiting').length).toBeGreaterThan(0);
    await waitFor(() => expect(rpc).not.toHaveBeenCalled());
    expect(screen.queryByText(/updated/)).not.toBeInTheDocument();
  });
});
