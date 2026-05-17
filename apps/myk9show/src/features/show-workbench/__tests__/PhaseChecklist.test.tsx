import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@/test/utils/testUtils';
import { render } from '@/test/utils/testUtils';
import { PhaseChecklist } from '../PhaseChecklist';
import type { PhaseChecklistContext } from '../phaseChecklistDefinitions';

const context: PhaseChecklistContext = {
  show: {
    id: 'show-1',
    name: 'Bluegrass Classic',
    organization: 'AKC',
    startDate: '2026-03-22',
    endDate: '2026-03-23',
    location: 'Louisville, KY',
    clubName: 'Bluegrass KC',
    status: 'accepting_entries',
    events: [],
    source: 'myK9Show',
    entryOpenDate: '2026-01-01',
    entryCloseDate: '2026-03-01',
    preEntryFee: '$30',
    clubId: 'club-1',
    clubAddress: '',
    clubEmail: '',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    assignedJudges: [],
    stats: [],
    trials: [],
  },
  trials: [],
  classes: [],
  entries: [],
  judges: [],
};

function itemRow(title: string): HTMLElement {
  const row = screen.getByText(title).closest('[data-checklist-item-id]');
  if (!(row instanceof HTMLElement)) throw new Error(`Missing checklist row ${title}`);
  return row;
}

describe('PhaseChecklist', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders auto-complete progress for detected items', () => {
    render(<PhaseChecklist phase="setup" showId="show-1" context={context} />);

    expect(screen.getByRole('heading', { name: '1 of 5 handled' })).toBeInTheDocument();
    expect(within(itemRow('Show details are set')).getByText('Auto')).toBeInTheDocument();
    expect(within(itemRow('Trials are added')).getByText('Open')).toBeInTheDocument();
  });

  it('allows manual done and skip choices without changing auto-complete items', async () => {
    const { user } = render(
      <PhaseChecklist phase="today" showId="show-1" context={context} />
    );

    const entriesRow = itemRow('Entries are loaded');
    await user.click(within(entriesRow).getByRole('button', { name: 'Mark done' }));
    expect(within(entriesRow).getByText('Done')).toBeInTheDocument();

    const runOrderRow = itemRow('Run order has class times');
    await user.click(within(runOrderRow).getByRole('button', { name: 'Skip' }));
    expect(within(runOrderRow).getByText('Skipped')).toBeInTheDocument();

    expect(within(itemRow('Show-day tools are open')).getByText('Auto')).toBeInTheDocument();
    await waitFor(() => {
      expect(window.localStorage.getItem('myk9show:workbench-checklist:show-1:today')).toContain(
        'today-entries-loaded'
      );
    });
  });

  it('clears manual choices', async () => {
    const { user } = render(
      <PhaseChecklist phase="wrap-up" showId="show-1" context={context} />
    );
    const row = itemRow('Results are reviewed');

    await user.click(within(row).getByRole('button', { name: 'Skip' }));
    expect(within(row).getByText('Skipped')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Clear' }));

    expect(within(row).getByText('Open')).toBeInTheDocument();
  });
});
