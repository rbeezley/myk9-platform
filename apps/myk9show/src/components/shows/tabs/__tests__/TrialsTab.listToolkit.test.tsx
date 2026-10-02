import {
  captureCsvDownload,
  registeredPageExports,
  resetPageExports,
} from '@/test/utils/csvDownload';
import { render, screen, within } from '@/test/utils/testUtils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrialsTab } from '../TrialsTab';
import type { Trial } from '@/components/trials/types/trial.types';

// MYK9-929: Trials is a list like every other. Search + result sentence + labelled view toggle in
// the result line, a view that follows the default rule for the role and is remembered, and the
// one empty-state wording. The real `useViewPreference` runs here (localStorage), unmocked.

let mockCanManage = true;
let mockScopeStatus: 'resolved' | 'resolving' = 'resolved';
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({ status: mockScopeStatus, canManage: mockCanManage }),
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
    mockScopeStatus = 'resolved';
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

    await user.type(screen.getByPlaceholderText('Search trials...'), 'Completed');

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

  describe('Export CSV page action (the table button it replaced)', () => {
    afterEach(() => {
      resetPageExports();
    });

    it("registers one in the table view, with the table's columns, and not in cards", () => {
      renderTab();
      const registered = registeredPageExports();
      expect(registered.map(item => item.id)).toEqual(['trials']);

      const download = captureCsvDownload();
      try {
        registered[0]!.run();
        const [header, first] = download.csv().split('\n');
        expect(header).toBe('Date,Trial Name,Type,Time,Classes,Entries,Scored,Status');
        expect(first).toContain('"Trial 1"');
      } finally {
        download.restore();
      }
    });

    it('registers nothing in cards view or for an empty list', async () => {
      localStorage.setItem('view-pref-trials', 'cards');
      renderTab();
      expect(registeredPageExports()).toEqual([]);
    });
  });

  describe("no default-view flicker while the viewer's role resolves", () => {
    it('holds the list body until the role is known, rather than flashing the wrong view', () => {
      mockScopeStatus = 'resolving';
      mockCanManage = false;
      const { container } = renderTab();
      expect(container.querySelector('table')).toBeNull();
      expect(screen.queryByTestId('class-card')).not.toBeInTheDocument();
      expect(screen.queryByText('Containers')).not.toBeInTheDocument();
      expect(screen.queryByText('Trial 1')).not.toBeInTheDocument();
    });

    it('shows her remembered view at once, since the role cannot change it', () => {
      mockScopeStatus = 'resolving';
      localStorage.setItem('view-pref-trials', 'table');
      const { container } = renderTab();
      expect(container.querySelector('table')).not.toBeNull();
    });
  });

  describe('search finds a trial by every value its columns show', () => {
    const searchTrials = [
      makeTrial('s1', 'Alpha', {
        trialDate: '2026-05-10',
        status: 'Scheduled',
        trialType: 'scent_work',
        plannedStartTime: '08:00',
      }),
      makeTrial('s2', 'Bravo', {
        trialDate: '2026-06-21',
        status: 'Completed',
        trialType: 'rally',
        plannedStartTime: '13:30',
      }),
    ];
    const searchStats = {
      s1: { classCount: 2, entryCount: 8, completedClasses: 0 },
      s2: { classCount: 2, entryCount: 8, completedClasses: 2 },
    };
    const cases: Array<[string, string, string]> = [
      ['name', 'Alpha', 'Alpha'],
      ['date as shown', 'JUN 21', 'Bravo'],
      ['raw date', '2026-05-10', 'Alpha'],
      ['raw date part', '05', 'Alpha'],
      ['time', '13:30', 'Bravo'],
      ['status label', 'Completed', 'Bravo'],
      ['status label (not started)', 'Not started', 'Alpha'],
    ];
    it.each(cases)('%s', async (_label, query, expected) => {
      const { user } = render(
        <TrialsTab trials={searchTrials} showId="show-1" trialStats={searchStats} />
      );
      await user.type(screen.getByPlaceholderText('Search trials...'), query);
      expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 2 trials.');
      expect(screen.getByText(expected)).toBeInTheDocument();
    });

    it('exports exactly the rows on screen under a search', async () => {
      const { user } = render(
        <TrialsTab trials={searchTrials} showId="show-1" trialStats={searchStats} />
      );
      await user.type(screen.getByPlaceholderText('Search trials...'), 'Bravo');
      const download = captureCsvDownload();
      try {
        registeredPageExports()[0]!.run();
        const lines = download.csv().split('\n');
        expect(lines).toHaveLength(2);
        expect(lines[1]).toContain('"Bravo"');
      } finally {
        download.restore();
        resetPageExports();
      }
    });
  });
});
