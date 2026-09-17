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

  it('offers no "Open Entry Management" button, even handed the old callback', async () => {
    // MYK9-630: this was the third and fourth copy of a link that already sits
    // in the section nav row two inches above, and now also in the header
    // Actions menu. The tab keeps the count, which is the only thing it said
    // that the link did not.
    //
    // The retired `onManageEntries` prop is passed on PURPOSE. Rendering
    // without it would prove nothing: the deleted buttons were themselves
    // conditional on that prop, so the assertion would pass against the old
    // component too.
    const retiredProps = { showId: 's1', onManageEntries: vi.fn() } as unknown as {
      showId: string;
    };
    render(<EntriesTab {...retiredProps} />);
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /open entry management/i })).toBeNull();
  });
});
