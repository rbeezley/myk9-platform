/**
 * MYK9-795: the bespoke search `<Input>` was replaced by the shared
 * `ListFilterBar` search field. `MoveUpRequestsTab` had no test file before
 * this change; this covers that wiring (the view-count badge itself lives at
 * the page level — see `useMoveUpRequestsCount.test.ts` and
 * `EntryManagementPage.viewCounts.test.tsx`).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { MoveUpRequestsTab } from './MoveUpRequestsTab';

const REQUESTS = vi.hoisted(() => [
  {
    id: 'req-1',
    class_id: 'class-1',
    trial_id: 'trial-1',
    entry_status: 'move-up-requested',
    jump_height: null,
    special_requests: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    handler: 'Alice',
    armband: '1',
    dog: { id: 'dog-1', name: 'Fido', call_name: 'Fido' },
    class: { id: 'class-1', name: 'Novice A', class_number: '1', trial_id: 'trial-1' },
  },
  {
    id: 'req-2',
    class_id: 'class-2',
    trial_id: 'trial-1',
    entry_status: 'move-up-requested',
    jump_height: null,
    special_requests: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    handler: 'Bob',
    armband: '2',
    dog: { id: 'dog-2', name: 'Rex', call_name: 'Rex' },
    class: { id: 'class-2', name: 'Open B', class_number: '2', trial_id: 'trial-1' },
  },
]);

vi.mock('@/services/database/day-of-operations', () => ({
  getPendingMoveUpRequests: vi.fn().mockResolvedValue({ data: REQUESTS, error: null }),
  getClassesWithCapacity: (...args: unknown[]) => mocks.capacity(...args),
}));
const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  approve: vi.fn(),
  deny: vi.fn(),
  details: vi.fn(),
  names: vi.fn(),
  capacity: vi.fn(),
  trials: vi.fn(),
  undo: vi.fn(),
  showUndoToast: vi.fn(),
}));

vi.mock('@/services/show-day/requestManagement', () => ({
  acceptClassChangeRequestReplicated: mocks.accept,
  approveMoveUpRequestReplicated: mocks.approve,
  denyMoveUpRequestReplicated: mocks.deny,
}));
vi.mock('@/services/database/entries/classChangeRequests', async importActual => ({
  ...(await importActual<typeof import('@/services/database/entries/classChangeRequests')>()),
  getClassChangeRequestDetails: mocks.details,
  getRequestedClassesByIds: mocks.names,
}));
vi.mock('@/features/show-map/showMapActionMutations', () => ({ undoShowMapMoveUp: mocks.undo }));
vi.mock('@/lib/undoToast', () => ({ showUndoToast: mocks.showUndoToast }));
vi.mock('@/services/database/trials', () => ({
  getTrialsByShow: (...args: unknown[]) => mocks.trials(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.capacity.mockResolvedValue({ data: [], error: null });
  mocks.trials.mockResolvedValue({ data: [], error: null });
  // req-1 asked for a class and a reason; req-2 is a legacy move-up with no stored class.
  mocks.details.mockResolvedValue({
    'req-1': {
      entryId: 'req-1',
      targetClassId: 'class-adv',
      reason: 'finished_level',
      requestedAt: '2026-11-16T12:12:00Z',
    },
    'req-2': { entryId: 'req-2', targetClassId: null, reason: null, requestedAt: null },
  });
  mocks.names.mockResolvedValue({ 'class-adv': { name: 'Open C', trialId: null } });
  mocks.accept.mockResolvedValue({
    data: { originalEntryId: 'req-1', newEntryId: 'new-1', targetClassName: 'Open C' },
    error: null,
  });
  mocks.deny.mockResolvedValue({ error: null });
  mocks.undo.mockResolvedValue(undefined);
});

describe('MoveUpRequestsTab', () => {
  it('shows the class asked for and the stored reason on the request line', async () => {
    render(<MoveUpRequestsTab showId="show-1" />);
    const line = (await screen.findAllByTestId('class-change-line'))[0] as HTMLElement;
    expect(line).toHaveTextContent('#1 Novice A');
    expect(line).toHaveTextContent('Open C');
    expect(await screen.findByText(/Finished this level/)).toBeInTheDocument();
  });

  it('Accept moves the entry to exactly the stored class, with no picker and no dialog', async () => {
    const user = userEvent.setup();
    render(<MoveUpRequestsTab showId="show-1" />);
    await screen.findAllByTestId('class-change-line');
    await user.click(screen.getAllByRole('button', { name: 'Accept' })[0] as HTMLElement);

    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith('req-1', 'class-adv'));
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Class change accepted: Fido to Open C' })
    );
  });

  it('refuses Accept when the exhibitor took the request back since the list loaded', async () => {
    const user = userEvent.setup();
    render(<MoveUpRequestsTab showId="show-1" />);
    await screen.findAllByTestId('class-change-line');
    mocks.details.mockResolvedValue({});
    await user.click(screen.getAllByRole('button', { name: 'Accept' })[0] as HTMLElement);

    await waitFor(() => expect(mocks.details).toHaveBeenCalledWith(['req-1']));
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it('refuses Accept when the exhibitor asked for a different class since the list loaded', async () => {
    const user = userEvent.setup();
    render(<MoveUpRequestsTab showId="show-1" />);
    await screen.findAllByTestId('class-change-line');
    mocks.details.mockResolvedValue({
      'req-1': { entryId: 'req-1', targetClassId: 'class-other', reason: null, requestedAt: null },
    });
    await user.click(screen.getAllByRole('button', { name: 'Accept' })[0] as HTMLElement);

    await waitFor(() => expect(mocks.details).toHaveBeenCalledWith(['req-1']));
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it('Undo reverses exactly the move that Accept made', async () => {
    const user = userEvent.setup();
    render(<MoveUpRequestsTab showId="show-1" />);
    await screen.findAllByTestId('class-change-line');
    await user.click(screen.getAllByRole('button', { name: 'Accept' })[0] as HTMLElement);
    await waitFor(() => expect(mocks.showUndoToast).toHaveBeenCalled());

    mocks.showUndoToast.mock.calls[0]?.[0].onUndo();
    await waitFor(() =>
      expect(mocks.undo).toHaveBeenCalledWith({
        originalEntryId: 'req-1',
        newEntryId: 'new-1',
        targetClassName: 'Open C',
      })
    );
  });

  it('after Undo, the request is waiting in the list again (MYK9-2122)', async () => {
    const { getPendingMoveUpRequests } = await import('@/services/database/day-of-operations');
    const user = userEvent.setup();
    render(<MoveUpRequestsTab showId="show-1" />);
    await screen.findAllByTestId('class-change-line');

    // Accepted: the replica no longer holds req-1 as waiting.
    vi.mocked(getPendingMoveUpRequests).mockResolvedValueOnce({
      data: [REQUESTS[1]],
      error: null,
    } as never);
    await user.click(screen.getAllByRole('button', { name: 'Accept' })[0] as HTMLElement);
    await waitFor(() => expect(screen.queryByText('Fido')).not.toBeInTheDocument());

    // Undo: reverse_move_up_entry restores the source as move-up-requested, and the
    // list reads it back as a waiting request with the class it asked for.
    mocks.showUndoToast.mock.calls[0]?.[0].onUndo();
    expect(await screen.findByText('Fido')).toBeInTheDocument();
    expect((await screen.findAllByTestId('class-change-line'))[0]).toHaveTextContent('Open C');
  });

  it('keeps the class picker for a legacy request with no stored class', async () => {
    const user = userEvent.setup();
    render(<MoveUpRequestsTab showId="show-1" />);
    await screen.findAllByTestId('class-change-line');
    await user.click(screen.getAllByRole('button', { name: 'Accept' })[1] as HTMLElement);

    expect(await screen.findByText('Accept class change')).toBeInTheDocument();
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it('turns Accept off when the stored class could not be read, rather than guessing', async () => {
    mocks.details.mockRejectedValue(new Error('offline'));
    render(<MoveUpRequestsTab showId="show-1" />);
    await screen.findAllByTestId('class-change-line');
    for (const button of screen.getAllByRole('button', { name: 'Accept' })) {
      expect(button).toBeDisabled();
    }
  });

  it('Decline keeps its reason dialog and passes the reason on', async () => {
    const user = userEvent.setup();
    render(<MoveUpRequestsTab showId="show-1" />);
    await screen.findAllByTestId('class-change-line');
    await user.click(screen.getAllByRole('button', { name: 'Decline' })[0] as HTMLElement);
    await user.type(await screen.findByLabelText('Reason (optional)'), 'Class is full');
    await user.click(screen.getAllByRole('button', { name: 'Decline' }).at(-1) as HTMLElement);

    await waitFor(() => expect(mocks.deny).toHaveBeenCalledWith('req-1', 'Class is full'));
  });

  it('renders the shared ListFilterBar search field instead of a bespoke one', async () => {
    render(<MoveUpRequestsTab showId="show-1" />);
    expect(
      await screen.findByPlaceholderText('Search by dog, handler, or class...')
    ).toBeInTheDocument();
  });

  it('narrows the list by the shared search field', async () => {
    const user = userEvent.setup();
    render(<MoveUpRequestsTab showId="show-1" />);

    const search = await screen.findByPlaceholderText('Search by dog, handler, or class...');
    expect(screen.getByText('Fido')).toBeInTheDocument();
    expect(screen.getByText('Rex')).toBeInTheDocument();

    await user.type(search, 'Rex');

    await waitFor(() => expect(screen.queryByText('Fido')).not.toBeInTheDocument());
    expect(screen.getByText('Rex')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show all requests' }));
    expect(await screen.findByText('Fido')).toBeInTheDocument();
  });

  it("says which trial a request's class is in", async () => {
    mocks.trials.mockResolvedValue({
      data: [{ id: 'trial-1', date: '2026-11-09', trial_number: 'Trial 1' }],
      error: null,
    });

    render(<MoveUpRequestsTab showId="show-1" />);

    expect((await screen.findAllByText('Mon, Nov 9 · Trial 1')).length).toBeGreaterThan(0);
  });

  it('does not render a search field when there are no pending requests', async () => {
    const { getPendingMoveUpRequests } = await import('@/services/database/day-of-operations');
    vi.mocked(getPendingMoveUpRequests).mockResolvedValueOnce({ data: [], error: null });

    render(<MoveUpRequestsTab showId="show-1" />);

    await screen.findByText('No class changes waiting');
    expect(
      screen.queryByPlaceholderText('Search by dog, handler, or class...')
    ).not.toBeInTheDocument();
  });

  describe('late note and entered count (MYK9-2122)', () => {
    // Trial 2 starts 9:00 AM UTC on 2026-11-16; req-1 asked at 12:12Z in the seed, so move it.
    const trialRow = {
      id: 'trial-2',
      date: '2026-11-16',
      trial_number: '2',
      planned_start_time: '9:00 AM',
      timezone: 'UTC',
    };
    const targetClass = (maxEntries: number | null) => ({
      id: 'class-adv',
      name: 'Open C',
      class_number: '3',
      max_entries: maxEntries,
      trial_id: 'trial-2',
      accepted_count: 4,
      available_spots: 8,
      element: null,
      level: null,
      section: null,
    });
    const askedAt = (requestedAt: string) =>
      mocks.details.mockResolvedValue({
        'req-1': {
          entryId: 'req-1',
          targetClassId: 'class-adv',
          reason: 'finished_level',
          requestedAt,
        },
        'req-2': { entryId: 'req-2', targetClassId: null, reason: null, requestedAt: null },
      });

    it('carries a late note when asked inside 30 minutes of the requested trial start', async () => {
      mocks.trials.mockResolvedValue({ data: [trialRow], error: null });
      mocks.capacity.mockResolvedValue({ data: [targetClass(12)], error: null });
      askedAt('2026-11-16T08:48:00Z');
      render(<MoveUpRequestsTab showId="show-1" />);
      expect(await screen.findByTestId('class-change-late-note')).toHaveTextContent(
        'Late: asked 12 minutes before start'
      );
    });

    it('carries no late note, never one from the source trial, when the requested class cannot be found (MYK9-2147)', async () => {
      // The source trial (trial-1) starts 9:00 AM; the request was asked 12 minutes before it.
      mocks.trials.mockResolvedValue({
        data: [{ ...trialRow, id: 'trial-1', trial_number: '1' }],
        error: null,
      });
      mocks.names.mockResolvedValue({});
      askedAt('2026-11-16T08:48:00Z');
      render(<MoveUpRequestsTab showId="show-1" />);
      await screen.findAllByTestId('class-change-line');
      expect(screen.queryByTestId('class-change-late-note')).not.toBeInTheDocument();
    });

    it('carries no late note when asked 30 minutes or more before the start', async () => {
      mocks.trials.mockResolvedValue({ data: [trialRow], error: null });
      mocks.capacity.mockResolvedValue({ data: [targetClass(12)], error: null });
      askedAt('2026-11-16T08:30:00Z');
      render(<MoveUpRequestsTab showId="show-1" />);
      await screen.findAllByTestId('class-change-line');
      expect(screen.queryByTestId('class-change-late-note')).not.toBeInTheDocument();
    });

    it('says N of M entered for the class asked for', async () => {
      mocks.trials.mockResolvedValue({ data: [trialRow], error: null });
      mocks.capacity.mockResolvedValue({ data: [targetClass(12)], error: null });
      render(<MoveUpRequestsTab showId="show-1" />);
      expect(await screen.findByText(/4 of 12 entered/)).toBeInTheDocument();
    });

    it('leaves out "of M" when the class has no limit', async () => {
      mocks.trials.mockResolvedValue({ data: [trialRow], error: null });
      mocks.capacity.mockResolvedValue({ data: [targetClass(null)], error: null });
      render(<MoveUpRequestsTab showId="show-1" />);
      expect(await screen.findByText(/4 entered/)).toBeInTheDocument();
      expect(screen.queryByText(/of \d+ entered/)).not.toBeInTheDocument();
    });
  });

  describe('the trial of the class asked for (MYK9-2129)', () => {
    const trial = (id: string, date: string, number: string) => ({
      id,
      date,
      trial_number: number,
    });
    const classIn = (trialId: string) => ({
      id: 'class-adv',
      name: 'Open C',
      class_number: '3',
      max_entries: 12,
      trial_id: trialId,
      accepted_count: 4,
      available_spots: 8,
      element: null,
      level: null,
      section: null,
    });
    it('names the other trial next to the class asked for, with its entered count', async () => {
      mocks.trials.mockResolvedValue({
        data: [
          trial('trial-1', '2026-11-16', 'Trial 1'),
          trial('trial-4', '2026-11-16', 'Trial 4'),
        ],
        error: null,
      });
      mocks.capacity.mockResolvedValue({ data: [classIn('trial-4')], error: null });
      render(<MoveUpRequestsTab showId="show-1" />);
      expect(await screen.findByTestId('class-change-target-facts')).toHaveTextContent(
        /^in Trial 4 · 4 of 12 entered$/
      );
      expect(
        await screen.findByText('From Mon, Nov 16 · Trial 1 · Finished this level')
      ).toBeInTheDocument();
    });

    it('still names the other trial when the capacity read fails', async () => {
      mocks.trials.mockResolvedValue({
        data: [
          trial('trial-1', '2026-11-16', 'Trial 1'),
          trial('trial-4', '2026-11-16', 'Trial 4'),
        ],
        error: null,
      });
      mocks.names.mockResolvedValue({ 'class-adv': { name: 'Open C', trialId: 'trial-4' } });
      mocks.capacity.mockResolvedValue({ data: null, error: new Error('not synced') });
      render(<MoveUpRequestsTab showId="show-1" />);
      expect(await screen.findByTestId('class-change-target-facts')).toHaveTextContent(
        /^in Trial 4$/
      );
    });

    it('adds the day when the other trial is on another day', async () => {
      mocks.trials.mockResolvedValue({
        data: [trial('trial-1', '2026-11-16', 'Trial 1'), trial('trial-4', '2026-11-17', '4')],
        error: null,
      });
      mocks.capacity.mockResolvedValue({ data: [classIn('trial-4')], error: null });
      render(<MoveUpRequestsTab showId="show-1" />);
      expect(await screen.findByTestId('class-change-target-facts')).toHaveTextContent(
        /^in Tue, Nov 17 · Trial 4 · 4 of 12 entered$/
      );
    });

    it('adds no trial and no "From" when the class asked for is in the same trial', async () => {
      mocks.trials.mockResolvedValue({
        data: [trial('trial-1', '2026-11-16', 'Trial 1')],
        error: null,
      });
      mocks.capacity.mockResolvedValue({ data: [classIn('trial-1')], error: null });
      render(<MoveUpRequestsTab showId="show-1" />);
      expect(await screen.findByTestId('class-change-target-facts')).toHaveTextContent(
        /^4 of 12 entered$/
      );
      expect(
        await screen.findByText('Mon, Nov 16 · Trial 1 · Finished this level')
      ).toBeInTheDocument();
      expect(screen.queryByText(/^From /)).not.toBeInTheDocument();
    });
  });
});
