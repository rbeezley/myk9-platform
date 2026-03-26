import { render, screen } from '@/test/utils/testUtils';
import { ClassesTab } from '../ClassesTab';

const mockClasses = [
  {
    id: 'c1',
    name: 'Detective Novice',
    element: 'Detective',
    level: 'Novice',
    section: '',
    judgeName: 'Richard Beezley',
    trialId: 't1',
    time: '8:00 AM',
    ring: 1,
    status: 'upcoming' as const,
    entryCount: 4,
    userHasEntry: true,
    trialDate: '2026-05-09',
    trialNumber: '1',
    trialName: 'Saturday Trial 1',
  },
  {
    id: 'c2',
    name: 'Handler Discrimination Novice',
    element: 'Handler Discrimination',
    level: 'Novice',
    section: '',
    judgeName: 'Richard Beezley',
    trialId: 't1',
    time: '9:00 AM',
    ring: 1,
    status: 'upcoming' as const,
    entryCount: 6,
    userHasEntry: false,
    trialDate: '2026-05-09',
    trialNumber: '1',
    trialName: 'Saturday Trial 1',
  },
];

describe('ClassesTab table view', () => {
  it('renders sortable column headers including Trial', () => {
    render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={false} />);
    const headers = screen.getAllByRole('columnheader');
    const headerTexts = headers.map(h => h.textContent ?? '');
    // textContent may include sort-index numbers (e.g. "Element2"), so use partial matching
    expect(headerTexts.some(t => t.startsWith('Trial'))).toBe(true);
    expect(headerTexts.some(t => t.startsWith('Element'))).toBe(true);
    expect(headerTexts.some(t => t.startsWith('Level'))).toBe(true);
  });

  it('renders search input', () => {
    render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={false} />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('filters rows on search', async () => {
    const { user } = render(
      <ClassesTab classes={mockClasses} showId="s1" userHasEntries={false} />
    );
    await user.type(screen.getByPlaceholderText(/search/i), 'Detective');
    // Wait for debounce
    await new Promise(r => setTimeout(r, 400));
    expect(screen.getByText('Detective')).toBeInTheDocument();
    expect(screen.queryByText('Handler Discrimination')).not.toBeInTheDocument();
  });

  it('renders column visibility toggle', () => {
    render(<ClassesTab classes={mockClasses} showId="s1" userHasEntries={false} />);
    expect(screen.getByRole('button', { name: /toggle columns/i })).toBeInTheDocument();
  });
});
