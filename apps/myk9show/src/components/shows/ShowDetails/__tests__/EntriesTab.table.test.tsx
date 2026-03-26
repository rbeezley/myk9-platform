import { render, screen, waitFor } from '@/test/utils/testUtils';
import { EntriesTab } from '../EntriesTab';

vi.mock('@/services/database/queries/entryQueries', () => ({
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

describe('EntriesTab table', () => {
  it('renders sortable column headers', async () => {
    render(<EntriesTab showId="s1" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /dog/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /class/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /status/i })).toBeInTheDocument();
  });

  it('renders search input', async () => {
    render(<EntriesTab showId="s1" />);
    await waitFor(() => expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument());
  });

  it('renders data rows', async () => {
    render(<EntriesTab showId="s1" />);
    await waitFor(() => expect(screen.getByText('Maximus')).toBeInTheDocument());
    expect(screen.getByText('Tera')).toBeInTheDocument();
  });

  it('filters rows on search', async () => {
    const { user } = render(<EntriesTab showId="s1" />);
    await waitFor(() => expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText(/search/i), 'Maximus');
    await waitFor(() => {
      expect(screen.getByText('Maximus')).toBeInTheDocument();
      expect(screen.queryByText('Tera')).not.toBeInTheDocument();
    });
  });
});
