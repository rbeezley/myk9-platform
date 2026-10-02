import { render, screen, within } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrialsTab } from '../TrialsTab';
import type { Trial } from '@/components/trials/types/trial.types';

// MYK9-929: Trials is a list like every other. Search + result sentence + labelled view toggle in
// the result line, a view that follows the default rule for the role and is remembered, and the
// one empty-state wording. The real `useViewPreference` runs here (localStorage), unmocked.

let mockCanManage = true;
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({ status: 'resolved', canManage: mockCanManage }),
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

function makeTrial(id: string, name: string, patch: Partial<Trial> = {}): Trial {
  return {
    id,
    showId: 'show-1',
    showName: 'Test Show',
    trialDate: '2026-05-10',
    name,
    trialNumber: name,
    status: 'Scheduled',
    ...patch,
  } as Trial;
}

const trials = [makeTrial('t1', 'Trial 1'), makeTrial('t2', 'Trial 2', { status: 'Completed' })];
const stats = {
  t1: { classCount: 2, entryCount: 8, completedClasses: 0 },
  t2: { classCount: 2, entryCount: 8, completedClasses: 2 },
};

const renderTab = (rows: Trial[] = trials) =>
  render(<TrialsTab trials={rows} showId="show-1" trialStats={stats} />);

describe('TrialsTab list toolkit', () => {
  beforeEach(() => {
    localStorage.clear();
    mockCanManage = true;
    navigate.mockReset();
  });

  it('has the shared toolbar: search, result sentence, and the view toggle inside the result line', () => {
    renderTab();

    expect(screen.getByPlaceholderText('Search trials...')).toBeInTheDocument();
    const sentence = screen.getByRole('status');
    expect(sentence).toHaveTextContent('Showing all 2 trials.');
    const resultLine = sentence.parentElement as HTMLElement;
    expect(within(resultLine).getByRole('button', { name: 'Cards view' })).toBeInTheDocument();
    expect(within(resultLine).getByRole('button', { name: 'Table view' })).toBeInTheDocument();
    // Owner decision 4: no Columns, Export, density or Reset in the table's own toolbar.
    expect(screen.queryByRole('button', { name: /columns|export|density|reset/i })).toBeNull();
  });

  it('searches the trials and says how many match, with a way back', async () => {
    const { user } = renderTab();

    await user.type(screen.getByPlaceholderText('Search trials...'), 'Trial 2');

    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 2 trials.');
    await user.click(screen.getByRole('button', { name: 'Show all trials' }));
    expect(screen.getByRole('status')).toHaveTextContent('Showing all 2 trials.');
  });

  it('opens a manager on the table and a visitor on cards (decision 8)', () => {
    mockCanManage = true;
    const first = renderTab();
    expect(first.container.querySelector('table')).not.toBeNull();
    first.unmount();

    localStorage.clear();
    mockCanManage = false;
    const second = renderTab();
    expect(second.container.querySelector('table')).toBeNull();
  });

  it("remembers her own choice across visits, over the role's default", async () => {
    mockCanManage = true;
    const first = renderTab();
    await first.user.click(screen.getByRole('button', { name: 'Cards view' }));
    expect(first.container.querySelector('table')).toBeNull();
    first.unmount();

    const second = renderTab();
    expect(second.container.querySelector('table')).toBeNull();
    expect(localStorage.getItem('view-pref-trials')).toBe('cards');
  });

  it('uses the one empty-state wording', () => {
    renderTab([]);
    expect(screen.getByRole('heading', { name: 'No trials yet' })).toBeInTheDocument();
  });

  it('uses the one filtered-empty wording with the shared reset label', async () => {
    const { user } = renderTab();
    await user.type(screen.getByPlaceholderText('Search trials...'), 'zzz');
    expect(
      screen.getByRole('heading', { name: 'No trials match your search or filters.' })
    ).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Show all trials' })[0]!);
    expect(screen.getByRole('status')).toHaveTextContent('Showing all 2 trials.');
  });
});
