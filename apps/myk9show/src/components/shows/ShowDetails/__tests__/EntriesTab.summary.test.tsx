import { render, screen, waitFor } from '@/test/utils/testUtils';
import { EntriesTab } from '../EntriesTab';

// EntriesTab is manager-only (see ShowDetailTabs) — managers are always
// authenticated, so it always resolves via the authenticated read.
vi.mock('@/services/database/entries', () => ({
  getEntriesByShow: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'e1',
        entry_status: 'submitted',
        handler: 'Jim Sills',
        armband: '103',
        entry_fee: 30,
        payment_status: 'paid',
        created_at: '2026-03-24T10:00:00Z',
        dog: {
          id: 'd1',
          name: 'Maximus',
          call_name: 'Max',
          breed: 'Dutch Shepherd',
          owner: { id: 'p1', first_name: 'Jim', last_name: 'Sills', email: 'jim@test.com' },
        },
        class: { id: 'c1', name: 'Detective', class_number: 1, entry_fee: 30 },
      },
      {
        id: 'e2',
        entry_status: 'submitted',
        handler: 'Richard Beezley',
        armband: '101',
        entry_fee: 30,
        payment_status: 'paid',
        created_at: '2026-03-24T11:00:00Z',
        dog: {
          id: 'd2',
          name: 'Tera',
          call_name: null,
          breed: 'Akita',
          owner: { id: 'p2', first_name: 'Richard', last_name: 'Beezley', email: 'r@test.com' },
        },
        class: { id: 'c1', name: 'Detective', class_number: 1, entry_fee: 30 },
      },
    ],
    error: null,
  }),
}));

describe('EntriesTab summary', () => {
  it('renders the total entries count instead of a table', async () => {
    render(<EntriesTab showId="s1" />);
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
    expect(screen.getByText(/entries across this show/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
  });

  it('renders one primary "Open Entry Management" button that calls onManageEntries', async () => {
    const onManageEntries = vi.fn();
    const { user } = render(<EntriesTab showId="s1" onManageEntries={onManageEntries} />);
    const button = await screen.findByRole('button', { name: /open entry management/i });
    await user.click(button);
    expect(onManageEntries).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button', { name: /open entry management/i })).toHaveLength(1);
  });
});
