/**
 * MYK9-795: the bespoke search `<Input>` was replaced by the shared
 * `ListFilterBar` search field. `MoveUpRequestsTab` had no test file before
 * this change; this covers that wiring (the view-count badge itself lives at
 * the page level — see `useMoveUpRequestsCount.test.ts` and
 * `EntryManagementPage.viewCounts.test.tsx`).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
vi.mock('@/services/database/trials', () => ({
  getTrialsByShow: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

describe('MoveUpRequestsTab', () => {
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

  it('does not render a search field when there are no pending requests', async () => {
    const { getPendingMoveUpRequests } = await import('@/services/database/day-of-operations');
    vi.mocked(getPendingMoveUpRequests).mockResolvedValueOnce({ data: [], error: null });

    render(<MoveUpRequestsTab showId="show-1" />);

    await screen.findByText('No Pending Move-Up Requests');
    expect(
      screen.queryByPlaceholderText('Search by dog, handler, or class...')
    ).not.toBeInTheDocument();
  });
});
