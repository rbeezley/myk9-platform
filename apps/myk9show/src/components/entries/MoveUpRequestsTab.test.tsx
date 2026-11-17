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
  getClassesWithCapacity: vi.fn().mockResolvedValue({ data: [], error: null }),
}));
const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  approve: vi.fn(),
  deny: vi.fn(),
  details: vi.fn(),
  names: vi.fn(),
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
  getClassNamesByIds: mocks.names,
}));
vi.mock('@/features/show-map/showMapActionMutations', () => ({ undoShowMapMoveUp: mocks.undo }));
vi.mock('@/lib/undoToast', () => ({ showUndoToast: mocks.showUndoToast }));
vi.mock('@/services/database/trials', () => ({
  getTrialsByShow: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

beforeEach(() => {
  vi.clearAllMocks();
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
  mocks.names.mockResolvedValue({ 'class-adv': 'Open C' });
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
    const { getTrialsByShow } = await import('@/services/database/trials');
    vi.mocked(getTrialsByShow).mockResolvedValue({
      data: [{ id: 'trial-1', date: '2026-11-09', trial_number: 'Trial 1' }],
      error: null,
    } as unknown as Awaited<ReturnType<typeof getTrialsByShow>>);

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
});
