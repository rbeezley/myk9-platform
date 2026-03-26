import { render, screen } from '@/test/utils/testUtils';
import { MyEntriesTab } from '../MyEntriesTab';

vi.mock('@/hooks/useMyEntries', () => ({
  useMyEntries: () => ({
    entriesByClass: [
      {
        classId: 'c1',
        className: 'Detective Novice',
        scored: false,
        dogsAhead: 3,
        dogName: 'Tera',
        armband: '101',
      },
      {
        classId: 'c2',
        className: 'Handler Discrimination',
        scored: true,
        dogsAhead: 0,
        dogName: 'Tera',
        armband: '101',
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));

async function renderInTableView() {
  const result = render(<MyEntriesTab showId="s1" />);
  const tableToggle = screen.getByRole('button', { name: /table/i });
  await result.user.click(tableToggle);
  return result;
}

describe('MyEntriesTab table view', () => {
  it('renders sortable column headers', async () => {
    await renderInTableView();
    expect(screen.getByRole('button', { name: /class/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /status/i })).toBeInTheDocument();
  });

  it('renders data rows', async () => {
    await renderInTableView();
    expect(screen.getByText('Detective Novice')).toBeInTheDocument();
    expect(screen.getByText('Handler Discrimination')).toBeInTheDocument();
  });

  it('renders search input', async () => {
    await renderInTableView();
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });
});
