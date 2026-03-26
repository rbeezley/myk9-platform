import { render, screen } from '@/test/utils/testUtils';
import { TrialsTab } from '../TrialsTab';
import type { Trial } from '@/components/trials/types/trial.types';

const mockTrials: Trial[] = [
  {
    id: 't1',
    showId: 's1',
    showName: 'Test Show',
    trialDate: '2026-05-09',
    trialNumber: '1',
    status: 'upcoming',
    name: 'Saturday Trial 1',
    trialType: 'Scent Work',
    plannedStartTime: '8:00 AM',
  },
  {
    id: 't2',
    showId: 's1',
    showName: 'Test Show',
    trialDate: '2026-05-09',
    trialNumber: '2',
    status: 'upcoming',
    name: 'Saturday Trial 2',
    trialType: 'Scent Work',
    plannedStartTime: '12:00 PM',
  },
];

const mockStats = {
  t1: { classCount: 6, entryCount: 12, completedClasses: 0 },
  t2: { classCount: 10, entryCount: 25, completedClasses: 3 },
};

async function renderInTableView() {
  const result = render(<TrialsTab trials={mockTrials} showId="s1" trialStats={mockStats} />);
  const tableToggle = screen.getByRole('button', { name: /table/i });
  await result.user.click(tableToggle);
  return result;
}

describe('TrialsTab table view', () => {
  it('renders sortable column headers', async () => {
    await renderInTableView();
    expect(screen.getByRole('button', { name: /date/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /trial name/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /status/i })).toBeInTheDocument();
  });

  it('renders data rows', async () => {
    await renderInTableView();
    expect(screen.getByText('Saturday Trial 1')).toBeInTheDocument();
    expect(screen.getByText('Saturday Trial 2')).toBeInTheDocument();
  });

  it('renders search input', async () => {
    await renderInTableView();
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('filters rows on search', async () => {
    const { user } = await renderInTableView();
    await user.type(screen.getByPlaceholderText(/search/i), 'Saturday Trial 1');
    await new Promise(r => setTimeout(r, 400));
    expect(screen.getByText('Saturday Trial 1')).toBeInTheDocument();
    expect(screen.queryByText('Saturday Trial 2')).not.toBeInTheDocument();
  });

  it('renders column visibility toggle', async () => {
    await renderInTableView();
    expect(screen.getByRole('button', { name: /toggle columns/i })).toBeInTheDocument();
  });
});
