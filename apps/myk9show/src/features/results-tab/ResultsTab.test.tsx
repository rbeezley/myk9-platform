import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import { render, screen, within } from '@/test/utils/testUtils';
import type { SecretaryCockpitPaperwork } from '@/features/show-map/cockpit/secretaryCockpitTypes';
import type { SecretaryEntry } from '@/services/database/entries';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trial-store-types';
import { buildResultsClassRows } from './buildResultsClassRows';
import ResultsTab from './ResultsTab';
import type { ResultsTabReadState } from './useResultsTabData';

const SYNC = {
  _version: 1,
  _lastModified: new Date(0),
  _lastModifiedBy: '',
  _syncStatus: 'synced',
} as const;

const trial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Fall Trial',
  trialDate: '2026-10-10',
  trialNumber: '1',
  status: 'Scheduled',
  ...SYNC,
} as SyncableTrial;

const level = (id: string, name: string, startTime: string): SyncableTrialClass =>
  ({
    id,
    element: 'Containers',
    level: name,
    section: '',
    judgeId: 'j1',
    judgeName: 'Pat Judge',
    startTime,
    status: 'Completed',
    entries: 0,
    ...SYNC,
  }) as SyncableTrialClass;

const entry = (id: string, classId: string, fields: Record<string, unknown> = {}) =>
  ({
    id,
    class_id: classId,
    entry_status: 'confirmed',
    check_in_status: 'checked-in',
    is_scored: true,
    result_status: 'qualified',
    armband: '101',
    final_placement: 1,
    search_time_seconds: 61.25,
    total_faults: 0,
    dog: { id: `d-${id}`, name: 'Ranger', call_name: 'Rex' },
    handler: 'Jane Doe',
    handler_person: null,
    ...fields,
  }) as unknown as SecretaryEntry;

const printed = (reportId: string): SecretaryCockpitPaperwork => ({
  reportId,
  label: reportId,
  state: 'current',
});
const unprinted = (reportId: string): SecretaryCockpitPaperwork => ({
  reportId,
  label: reportId,
  state: 'unconfirmed',
  printHref: `/shows/show-1/reports?report=${reportId}`,
});

function buildRows() {
  return buildResultsClassRows({
    trials: [trial],
    trialClasses: {
      'trial-1': [
        level('class-ready', 'Novice', '08:00'),
        level('class-released', 'Open', '09:00'),
        level('class-done', 'Advanced', '10:00'),
        {
          ...level('class-ring', 'Excellent', '11:00'),
          status: 'In Progress',
        } as SyncableTrialClass,
      ],
    },
    releasedAtByClassId: new Map<string, string | null>([
      ['class-ready', null],
      ['class-ring', null],
      ['class-released', '2026-10-10T16:00:00Z'],
      ['class-done', '2026-10-10T16:00:00Z'],
    ]),
    paperworkByClassId: new Map([
      ['class-released', [unprinted('results-sheet'), unprinted('result-labels')]],
      ['class-done', [printed('results-sheet'), printed('result-labels')]],
      ['class-ready', [unprinted('results-sheet'), unprinted('result-labels')]],
    ]),
    entries: [
      entry('e-ready', 'class-ready'),
      entry('e-released', 'class-released'),
      entry('e-done', 'class-done'),
      entry('e-ring-1', 'class-ring'),
      entry('e-ring-2', 'class-ring', { is_scored: false, result_status: 'pending' }),
    ],
  });
}

const hook = vi.hoisted(() => ({
  value: {
    rows: [] as ReturnType<typeof buildRows>,
    trials: [] as SyncableTrial[],
    readState: 'ready' as ResultsTabReadState,
    refreshFailed: false,
    paperworkAvailable: true,
    retry: vi.fn(),
  },
}));
vi.mock('./useResultsTabData', () => ({ useResultsTabData: () => hook.value }));

const releaseMutate = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/mutations/useReleaseResults', () => ({
  useReleaseResults: () => ({ mutate: releaseMutate, isPending: false }),
}));

const media = vi.hoisted(() => ({ wide: false }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => media.wide }));

vi.mock('./ResultsVisibilitySheet', () => ({
  ResultsVisibilitySheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="visibility-sheet" /> : null,
}));

function renderAt(search = '') {
  return render(
    <Routes>
      <Route path="/shows/:id/results" element={<ResultsTab />} />
    </Routes>,
    { initialRoute: `/shows/show-1/results${search}` }
  );
}

beforeEach(() => {
  media.wide = false;
  releaseMutate.mockReset();
  hook.value = {
    rows: buildRows(),
    trials: [trial],
    readState: 'ready',
    refreshFailed: false,
    paperworkAvailable: true,
    retry: vi.fn(),
  };
});

describe('ResultsTab list', () => {
  it('defaults the status filter to Needs me and shows only classes waiting on the secretary', () => {
    renderAt();

    const list = screen.getByRole('list', { name: 'Classes' });
    expect(within(list).getByText('Containers Novice')).toBeInTheDocument();
    expect(within(list).getByText('Containers Open')).toBeInTheDocument();
    expect(within(list).queryByText('Containers Advanced')).not.toBeInTheDocument();
    expect(within(list).queryByText('Containers Excellent')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Show' })).toHaveTextContent('Needs me');
  });

  it('shows every class, with Scored and Status, under All classes', () => {
    renderAt('?status=all');

    const list = screen.getByRole('list', { name: 'Classes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(within(list).getByText('1 / 2')).toBeInTheDocument();
    expect(within(list).getByText('In the ring')).toBeInTheDocument();
    expect(within(list).getByText('Ready to release')).toBeInTheDocument();
    expect(within(list).getByText('Done')).toBeInTheDocument();
  });

  it('opens a class from its name and sends an unfinished class to Overview', () => {
    renderAt('?status=all');

    expect(screen.getByRole('link', { name: /^Containers Novice/ })).toHaveAttribute(
      'href',
      '/shows/show-1/results?status=all&classId=class-ready'
    );
    expect(screen.getByRole('link', { name: 'Overview: Containers Excellent' })).toHaveAttribute(
      'href',
      '/shows/show-1?focus=class-ring'
    );
    expect(screen.getByRole('link', { name: 'Release: Containers Novice' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Print: Containers Open' })).toBeInTheDocument();
  });

  it('does not read an unreadable score list as nothing needing the secretary', () => {
    hook.value = { ...hook.value, rows: [], readState: 'unavailable' };
    renderAt();

    expect(screen.getByText("Couldn't load the scores")).toBeInTheDocument();
    expect(screen.queryByText('Nothing needs you right now.')).not.toBeInTheDocument();
  });

  it('keeps the classes and shows a warning when only a background refresh failed', () => {
    hook.value = { ...hook.value, refreshFailed: true };
    renderAt();

    expect(screen.getByText("Couldn't refresh the scores")).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Classes' })).toBeInTheDocument();
  });

  it('says nothing needs the secretary only when the scores loaded and none do', () => {
    hook.value = { ...hook.value, rows: buildRows().filter(row => row.phase === 'done') };
    renderAt();

    expect(screen.getByText('Nothing needs you right now.')).toBeInTheDocument();
  });

  it('points at Submit and Close once every class is released', () => {
    hook.value = {
      ...hook.value,
      rows: buildRows().filter(row => row.phase === 'done' || row.phase === 'released'),
    };
    renderAt();

    expect(screen.getByText('Every class is released')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Submit to registry/ })).toHaveAttribute(
      'href',
      '/shows/show-1/results?step=submit'
    );
    expect(screen.getByRole('link', { name: /Close the show/ })).toHaveAttribute(
      'href',
      '/shows/show-1/results?step=close'
    );
  });
});

describe('ResultsTab detail', () => {
  it('shows the class scores, a Fix link into the score flow, and releases through the existing mutation', async () => {
    const { user } = renderAt('?status=all&classId=class-ready');

    expect(screen.getByText('Class results')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Containers Novice' })).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Rex')).toBeInTheDocument();
    expect(within(table).getByText('1:01.25')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fix score for Rex' })).toHaveAttribute(
      'href',
      '/at-show/show-1/class/class-ready/score/e-ready'
    );

    await user.click(screen.getByRole('button', { name: 'Release results' }));

    expect(releaseMutate).toHaveBeenCalledTimes(1);
    expect(releaseMutate).toHaveBeenCalledWith(
      { classIds: ['class-ready'], showId: 'show-1' },
      expect.any(Object)
    );
  });

  it('selects the class named by ?classId under the default filter and keeps it in the list', () => {
    // Overview deep-links with only classId + trialId (getCockpitResultsControlHref), so the
    // default "Needs me" filter must not hide the class the link points at.
    media.wide = true;
    renderAt('?trialId=trial-1&classId=class-done');

    // The class name appears in the list row and again in the detail header.
    expect(screen.getAllByText(/Containers Advanced/).length).toBeGreaterThanOrEqual(2);
    const list = screen.getByRole('list', { name: 'Classes' });
    expect(within(list).getByRole('link', { name: /^Containers Advanced/ })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('ignores a ?classId that is not in this show', () => {
    renderAt('?classId=class-gone');

    expect(screen.queryByRole('button', { name: 'Release results' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Containers Novice/ })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('offers the print steps for a released class and no Release button', () => {
    renderAt('?status=all&classId=class-released');

    expect(screen.queryByRole('button', { name: 'Release results' })).not.toBeInTheDocument();
    expect(screen.getByText('Print the results sheet and ribbon labels')).toBeInTheDocument();
    expect(screen.getByText('Results sheet')).toBeInTheDocument();
    expect(screen.getByText('Ribbon labels')).toBeInTheDocument();
  });

  it('keeps the print actions and says print status is unknown, with Retry, when history is unreadable', async () => {
    hook.value = {
      ...hook.value,
      paperworkAvailable: false,
      rows: buildRows().map(row => ({ ...row, paperworkAvailable: false })),
    };
    const { user } = renderAt('?status=all&classId=class-released');

    expect(screen.getByText(/Print status unknown/)).toBeInTheDocument();
    const printLinks = screen.getAllByRole('link', { name: /Print/ });
    expect(printLinks.length).toBeGreaterThanOrEqual(2);
    expect(printLinks[0]).toHaveAttribute('href', expect.stringContaining('/reports'));
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(hook.value.retry).toHaveBeenCalledTimes(1);
  });

  it('sends an unfinished class back to Overview from its Primary work card', () => {
    renderAt('?status=all&classId=class-ring');

    expect(screen.getByText('Still in the ring')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open on Overview/ })).toHaveAttribute(
      'href',
      '/shows/show-1?focus=class-ring'
    );
  });
});

describe('ResultsTab toolbar', () => {
  it('keeps Submit and Close reachable from More, and Visibility settings opens the sheet', async () => {
    const { user } = renderAt();

    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('link', { name: 'Submit to registry' })).toHaveAttribute(
      'href',
      '/shows/show-1/results?step=submit'
    );
    expect(screen.getByRole('link', { name: 'Close the show' })).toHaveAttribute(
      'href',
      '/shows/show-1/results?step=close'
    );

    await user.click(screen.getByRole('button', { name: 'Visibility settings' }));
    expect(screen.getByTestId('visibility-sheet')).toBeInTheDocument();
  });

  it('counts the released classes still to print on Print all ready', async () => {
    const { user } = renderAt();

    const button = screen.getByRole('button', { name: /Print all ready/ });
    expect(button).toHaveTextContent('(1)');

    await user.click(button);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Containers Open')).toBeInTheDocument();
    expect(within(dialog).queryByText('Containers Advanced')).not.toBeInTheDocument();
  });
});
