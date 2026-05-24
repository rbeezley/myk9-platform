import { beforeEach, describe, expect, it } from 'vitest';
import { CLASS_STATUS } from '@myk9/core';
import { screen, waitFor, within } from '@/test/utils/testUtils';
import { render } from '@/test/utils/testUtils';
import { PhaseChecklist } from '../PhaseChecklist';
import type { PhaseChecklistContext } from '../phaseChecklistDefinitions';
import type { SyncableTrial } from '@/store/trial-store-types';

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

const trial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Bluegrass Classic',
  trialDate: '2026-03-22',
  trialNumber: '1',
  status: CLASS_STATUS.SCHEDULED,
  _version: 1,
  _lastModified: new Date('2026-01-01T00:00:00.000Z'),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced',
} satisfies SyncableTrial;

const todayContext: PhaseChecklistContext = {
  ...context,
  trials: [trial],
  classes: [
    {
      id: 'class-1',
      name: 'Container Novice',
      element: 'Container',
      level: 'Novice',
      section: 'A',
      judgeName: 'Judge Judy',
      trialId: 'trial-1',
      time: '09:00',
      status: CLASS_STATUS.SCHEDULED,
      entryCount: 0,
      scoredCount: 0,
      trialDate: '2026-03-22',
      trialNumber: '1',
      trialName: 'Trial 1',
    },
  ],
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
      <PhaseChecklist phase="setup" showId="show-1" context={todayContext} />
    );

    // Trials are added auto-completes from the trial fixture; mark a manual
    // item open and confirm the auto item is unaffected.
    const trialsRow = itemRow('Trials are added');
    expect(within(trialsRow).getByText('Auto')).toBeInTheDocument();

    const exhibitorMaterialsRow = itemRow('Exhibitor materials are published');
    await user.click(within(exhibitorMaterialsRow).getByRole('button', { name: 'Skip' }));
    expect(within(exhibitorMaterialsRow).getByText('Skipped')).toBeInTheDocument();

    expect(within(itemRow('Trials are added')).getByText('Auto')).toBeInTheDocument();
    await waitFor(() => {
      expect(window.localStorage.getItem('myk9show:workbench-checklist:show-1:setup')).toContain(
        'setup-exhibitor-materials'
      );
    });
  });

  it('clears manual choices', async () => {
    const { user } = render(
      <PhaseChecklist phase="setup" showId="show-1" context={context} />
    );
    const row = itemRow('Trials are added');

    await user.click(within(row).getByRole('button', { name: 'Skip' }));
    expect(within(row).getByText('Skipped')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Clear' }));

    expect(within(row).getByText('Open')).toBeInTheDocument();
  });

  it('clears a manual choice when live data auto-completes the same item', async () => {
    const { rerender, user } = render(
      <PhaseChecklist phase="setup" showId="show-1" context={context} />
    );
    const row = itemRow('Trials are added');

    await user.click(within(row).getByRole('button', { name: 'Mark done' }));
    expect(window.localStorage.getItem('myk9show:workbench-checklist:show-1:setup')).toContain(
      'setup-trials-added'
    );

    rerender(<PhaseChecklist phase="setup" showId="show-1" context={todayContext} />);

    expect(within(itemRow('Trials are added')).getByText('Auto')).toBeInTheDocument();
    await waitFor(() => {
      expect(window.localStorage.getItem('myk9show:workbench-checklist:show-1:setup')).not.toContain(
        'setup-trials-added'
      );
    });
  });
});
