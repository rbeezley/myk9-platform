import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import { TrialClassesTable } from '../TrialClassesTable';
import type { TrialClass } from '@/components/trials/types/trial.types';

// MYK9-929: the trial page's class list is the same list as Setup → Classes: the shared toolbar
// (search, result sentence, labelled view toggle in the result line), no Columns control, and
// every row opens the one class-detail URL, never the legacy /classes/:id redirect.

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('@/hooks/useClassEntriesPreview', () => ({
  useClassEntriesPreview: () => new Map(),
}));

const make = (id: string, element: string): TrialClass => ({
  id,
  element,
  level: 'Novice',
  section: 'A',
  status: 'Scheduled',
  judgeId: 'j1',
  judgeName: 'Judge Jane',
  startTime: '2026-06-15T09:00:00',
  entries: 4,
});
const classes = [make('c1', 'Containers'), make('c2', 'Interior')];

const renderTable = (props: Partial<React.ComponentProps<typeof TrialClassesTable>> = {}) =>
  render(
    <TrialClassesTable
      classes={classes}
      showId="s1"
      trialId="t1"
      onEditClass={vi.fn()}
      onDeleteClass={vi.fn()}
      {...props}
    />
  );

describe('TrialClassesTable list toolkit', () => {
  beforeEach(() => {
    localStorage.clear();
    navigate.mockReset();
  });

  it('has the shared toolbar: one search, the result sentence, the toggle inside the result line', () => {
    renderTable();

    expect(screen.getAllByPlaceholderText(/search/i)).toHaveLength(1);
    expect(screen.getByPlaceholderText('Search classes...')).toBeInTheDocument();
    const resultLine = screen.getByRole('status').parentElement as HTMLElement;
    expect(resultLine).toHaveTextContent('Showing all 2 classes.');
    expect(within(resultLine).getByRole('button', { name: 'Cards view' })).toBeInTheDocument();
    expect(within(resultLine).getByRole('button', { name: 'Table view' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /toggle columns|export|density|reset/i })
    ).toBeNull();
  });

  it('searches the classes and says how many match', async () => {
    const { user } = renderTable();
    await user.type(screen.getByPlaceholderText('Search classes...'), 'Interior');
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 2 classes.');
    expect(screen.queryByText('Containers')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all classes' }));
    expect(screen.getByRole('status')).toHaveTextContent('Showing all 2 classes.');
  });

  it('opens a manager on the table and a visitor on cards (decision 8), and remembers the pick', async () => {
    const manager = renderTable({ canManage: true });
    expect(manager.container.querySelector('table')).not.toBeNull();
    await manager.user.click(screen.getByRole('button', { name: 'Cards view' }));
    expect(manager.container.querySelector('table')).toBeNull();
    manager.unmount();

    // The same visitor on a later visit: her choice wins over the role's default.
    const again = renderTable({ canManage: true });
    expect(again.container.querySelector('table')).toBeNull();
    again.unmount();

    localStorage.clear();
    const visitor = renderTable({ canManage: false });
    expect(visitor.container.querySelector('table')).toBeNull();
  });

  it('uses the one empty-state wording', () => {
    renderTable({ classes: [] });
    expect(screen.getByRole('heading', { name: 'No classes yet' })).toBeInTheDocument();
  });

  it('opens the one class-detail URL from a table row', async () => {
    localStorage.setItem('view-pref-trial-classes', 'table');
    const { user } = renderTable();
    await user.click(screen.getByText('Interior'));
    expect(navigate).toHaveBeenCalledWith('/shows/s1/trials/t1/classes/c2');
  });

  it('opens the one class-detail URL from the row menu View item', async () => {
    localStorage.setItem('view-pref-trial-classes', 'table');
    const { user } = renderTable({ canManage: true });
    await user.click(screen.getAllByRole('button', { name: 'Class actions' })[0]!);
    await user.click(await screen.findByRole('menuitem', { name: /view details/i }));
    expect(navigate).toHaveBeenCalledWith(
      expect.stringMatching(/^\/shows\/s1\/trials\/t1\/classes\//)
    );
  });

  it('opens the one class-detail URL from a card', async () => {
    localStorage.setItem('view-pref-trial-classes', 'cards');
    const { user } = renderTable();
    await user.click(screen.getAllByText('Not started')[1]!);
    expect(navigate).toHaveBeenCalledWith('/shows/s1/trials/t1/classes/c2');
  });
});
