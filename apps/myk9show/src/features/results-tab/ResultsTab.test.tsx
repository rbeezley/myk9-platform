import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import { render, screen, waitFor, within } from '@/test/utils/testUtils';
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

const CHECKED = { at: '2026-10-10T15:45:00Z', by: 'auth-me' };

/** `checked: false` leaves the first class at Needs checking; `dayOver` finishes the judge's day. */
function buildRows({
  checked = true,
  dayOver = false,
  doneSigned = true,
  releasedChecked = true,
  unsynced = false,
} = {}) {
  return buildResultsClassRows({
    trials: [trial],
    trialClasses: {
      'trial-1': [
        level('class-ready', 'Novice', '08:00'),
        level('class-released', 'Open', '09:00'),
        {
          ...level('class-done', 'Advanced', '10:00'),
          judgeSignedOffAt: doneSigned ? '2026-10-10T21:00:00Z' : null,
        },
        {
          ...level('class-ring', 'Excellent', '11:00'),
          status: dayOver ? 'Completed' : 'In Progress',
        } as SyncableTrialClass,
      ],
    },
    verifiedByClassId: new Map([
      [
        'class-ready',
        checked && !unsynced
          ? CHECKED
          : { at: null, by: null, ...(unsynced ? { scoresUnsynced: true } : {}) },
      ],
      ['class-released', releasedChecked ? CHECKED : { at: null, by: null }],
      ['class-done', CHECKED],
      ['class-ring', { at: null, by: null }],
    ]),
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
      dayOver
        ? entry('e-ring-2', 'class-ring')
        : entry('e-ring-2', 'class-ring', { is_scored: false, result_status: 'pending' }),
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

const verifyMutate = vi.hoisted(() => vi.fn(async () => undefined));
const net = vi.hoisted(() => ({ online: true }));
vi.mock('@/hooks/useNetworkStatus', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useNetworkStatus')>()),
  useIsOnline: () => net.online,
}));
const undoMutate = vi.hoisted(() => vi.fn());
vi.mock('@/features/show-map/useResultsVerifiedMutations', () => ({
  useResultsVerifiedMutations: () => ({
    verifyAsync: verifyMutate,
    undo: undoMutate,
    isPending: false,
  }),
}));
const recordSignOff = vi.hoisted(() => vi.fn());
const clearSignOff = vi.hoisted(() => vi.fn());
vi.mock('@/features/show-map/useJudgeSignOffMutations', () => ({
  useJudgeSignOffMutations: () => ({ recordSignOff, clearSignOff, isPending: false }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'auth-me' } }) }));

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
  verifyMutate.mockReset();
  verifyMutate.mockResolvedValue(undefined);
  net.online = true;
  undoMutate.mockReset();
  recordSignOff.mockReset();
  clearSignOff.mockReset();
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

  it('points at Submit and Close once every class is released and initialed', () => {
    const initialed = buildRows({ dayOver: true }).map(row => ({
      ...row,
      judgeSignedOffAt: '2026-10-10T21:00:00Z',
      releasedAt: row.releasedAt ?? '2026-10-10T16:00:00Z',
    }));
    hook.value = { ...hook.value, rows: initialed };
    renderAt();

    expect(screen.getByText('Every class is released and signed off')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Submit to registry/ })).toHaveAttribute(
      'href',
      '/shows/show-1/results?step=submit'
    );
    expect(screen.getByRole('link', { name: /Close the show/ })).toHaveAttribute(
      'href',
      '/shows/show-1/results?step=close'
    );
  });

  it('holds the banner back while a released class still waits for the judge', () => {
    hook.value = {
      ...hook.value,
      rows: buildRows().filter(row => row.id === 'class-released' || row.id === 'class-done'),
    };
    renderAt();

    expect(screen.queryByText('Every class is released and signed off')).not.toBeInTheDocument();
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

describe('ResultsTab paper check', () => {
  const uncheckedRows = () => buildRows({ checked: false });

  it('keeps Release disabled until every dog is ticked and the scores are confirmed', async () => {
    hook.value = { ...hook.value, rows: uncheckedRows() };
    const { user } = renderAt('?status=all&classId=class-ready');

    expect(screen.getByText('Check the scores against the paper')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Release results' })).toBeDisabled();
    const confirm = screen.getByRole('button', { name: 'Scores match the paper' });
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Rex matches the paper' }));
    expect(confirm).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Release results' })).toBeDisabled();

    await user.click(confirm);
    expect(verifyMutate).toHaveBeenCalledWith({ classId: 'class-ready' });
    expect(releaseMutate).not.toHaveBeenCalled();
  });

  it('offline: dogs can still be ticked, but saving the check waits for a connection', async () => {
    net.online = false;
    hook.value = { ...hook.value, rows: uncheckedRows() };
    const { user } = renderAt('?status=all&classId=class-ready');

    await user.click(screen.getByRole('checkbox', { name: 'Rex matches the paper' }));
    expect(screen.getByRole('checkbox', { name: 'Rex matches the paper' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Scores match the paper' })).toBeDisabled();
    expect(screen.getByText('Connect to save the check')).toBeInTheDocument();
    expect(verifyMutate).not.toHaveBeenCalled();
  });

  it('offline: a saved check cannot be undone until the connection is back', () => {
    net.online = false;
    renderAt('?status=all&classId=class-ready');

    expect(screen.getByRole('button', { name: 'Undo check' })).toBeDisabled();
    expect(screen.getByText('Connect to save the check')).toBeInTheDocument();
  });

  it('with score changes waiting to sync: Confirm and Release wait, and the reason is shown', async () => {
    hook.value = { ...hook.value, rows: buildRows({ unsynced: true }) };
    const { user } = renderAt('?status=all&classId=class-ready');

    await user.click(screen.getByRole('checkbox', { name: 'Rex matches the paper' }));
    expect(screen.getByText('Waiting for score changes to sync')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scores match the paper' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Release results' })).toBeDisabled();
  });

  it('when the server says the scores moved (MK015), the ticks start over', async () => {
    verifyMutate.mockRejectedValueOnce({ code: 'MK015', message: 'changed' });
    hook.value = { ...hook.value, rows: uncheckedRows() };
    const { user } = renderAt('?status=all&classId=class-ready');

    await user.click(screen.getByRole('checkbox', { name: 'Rex matches the paper' }));
    await user.click(screen.getByRole('button', { name: 'Scores match the paper' }));

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Rex matches the paper' })).not.toBeChecked()
    );
    expect(screen.getByRole('button', { name: 'Scores match the paper' })).toBeDisabled();
  });

  it('keeps ticks when the save fails for any other reason', async () => {
    verifyMutate.mockRejectedValueOnce(new Error('network down'));
    hook.value = { ...hook.value, rows: uncheckedRows() };
    const { user } = renderAt('?status=all&classId=class-ready');

    await user.click(screen.getByRole('checkbox', { name: 'Rex matches the paper' }));
    await user.click(screen.getByRole('button', { name: 'Scores match the paper' }));

    await waitFor(() => expect(verifyMutate).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('checkbox', { name: 'Rex matches the paper' })).toBeChecked();
  });

  it('a released class whose check was undone shows the checklist again, and no second Release', async () => {
    media.wide = true;
    hook.value = { ...hook.value, rows: buildRows({ releasedChecked: false }) };
    const { user } = renderAt('?status=all&classId=class-released');

    expect(screen.getByText('Check the scores against the paper')).toBeInTheDocument();
    expect(screen.getByText(/already released/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Release results' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Rex matches the paper' }));
    expect(screen.getByRole('button', { name: 'Scores match the paper' })).toBeEnabled();
    // The list sends it back to Check scores.
    expect(screen.getByRole('link', { name: 'Check scores: Containers Open' })).toBeInTheDocument();
  });

  it('un-ticking a dog locks the confirmation again', async () => {
    hook.value = { ...hook.value, rows: uncheckedRows() };
    const { user } = renderAt('?status=all&classId=class-ready');

    const tick = screen.getByRole('checkbox', { name: 'Rex matches the paper' });
    await user.click(tick);
    await user.click(tick);
    expect(screen.getByRole('button', { name: 'Scores match the paper' })).toBeDisabled();
  });

  it('a corrected score needs checking again: a tick is only good for the result it was made on', async () => {
    hook.value = { ...hook.value, rows: uncheckedRows() };
    const { user, rerender } = renderAt('?status=all&classId=class-ready');
    await user.click(screen.getByRole('checkbox', { name: 'Rex matches the paper' }));
    expect(screen.getByRole('button', { name: 'Scores match the paper' })).toBeEnabled();

    hook.value = {
      ...hook.value,
      rows: uncheckedRows().map(row =>
        row.id === 'class-ready'
          ? { ...row, entries: row.entries.map(item => ({ ...item, resultLabel: 'NQ' })) }
          : row
      ),
    };
    rerender(
      <Routes>
        <Route path="/shows/:id/results" element={<ResultsTab />} />
      </Routes>
    );

    expect(screen.getByRole('button', { name: 'Scores match the paper' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Rex matches the paper' })).not.toBeChecked();
  });

  it('a checked class shows who checked it, offers Release, and can take the check back', async () => {
    const { user } = renderAt('?status=all&classId=class-ready');

    expect(screen.getByText(/Scores checked against the paper by you/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo check' }));
    expect(undoMutate).toHaveBeenCalledWith({ classId: 'class-ready' });
  });

  it('never releases a class that is not checked, even if the button were pressed', async () => {
    hook.value = { ...hook.value, rows: uncheckedRows() };
    renderAt('?status=all&classId=class-ready');

    // Disabled in the DOM; the page also refuses an unchecked class on its own.
    expect(screen.getByRole('button', { name: 'Release results' })).toBeDisabled();
    expect(releaseMutate).not.toHaveBeenCalled();
  });
});

describe('ResultsTab judge sign-off', () => {
  it('groups the open class by judge and day, and waits while the judge still has a class to run', () => {
    renderAt('?status=all&classId=class-done');

    const section = screen.getByRole('region', { name: 'Judge sign-off' });
    expect(within(section).getByText(/Pat Judge · .*Oct 10 · 3 of 4 complete/)).toBeInTheDocument();
    expect(within(section).getByText(/1 of 4 initialed by judge/i)).toBeInTheDocument();
    expect(within(section).getByText('Judge initials at end of day')).toBeInTheDocument();
    expect(
      within(section).queryByRole('button', { name: /Record initials/ })
    ).not.toBeInTheDocument();
    expect(within(section).getByRole('link', { name: /Print marked catalog/ })).toHaveAttribute(
      'href',
      expect.stringContaining('report=result-catalog')
    );
  });

  it('records the whole completed day at once, once the judge is done for the day', async () => {
    hook.value = { ...hook.value, rows: buildRows({ dayOver: true }) };
    const { user } = renderAt('?status=all&classId=class-released');

    const section = screen.getByRole('region', { name: 'Judge sign-off' });
    expect(within(section).getByText(/4 of 4 complete/)).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: /^Record initials: Pat Judge/ }));
    expect(recordSignOff).toHaveBeenCalledWith({
      classIds: ['class-ready', 'class-released', 'class-ring'],
      registryId: 'AKC',
    });
  });

  it('says "Judge not set" and drops the judge from the button when no judge is assigned', () => {
    const rows = buildRows({ dayOver: true }).map(row => ({
      ...row,
      judgeName: '',
      judgeId: '',
    }));
    hook.value = { ...hook.value, rows };
    renderAt('?status=all&classId=class-released');

    // With no judge each class is its own day, so the section is that one class.
    const section = screen.getByRole('region', { name: 'Judge sign-off' });
    expect(
      within(section).getByText(/^Judge not set · .*Oct 10 · 1 of 1 complete/)
    ).toBeInTheDocument();
    expect(
      within(section).getByRole('button', { name: /^Record initials: \w{3}, Oct 10$/ })
    ).toBeInTheDocument();
    expect(within(section).queryByText(/judge,/i)).not.toBeInTheDocument();
  });

  it('undoes one class at a time', async () => {
    hook.value = { ...hook.value, rows: buildRows({ dayOver: true }) };
    const { user } = renderAt('?status=all&classId=class-done');

    await user.click(screen.getByRole('button', { name: 'Undo initials: Containers Advanced' }));
    expect(clearSignOff).toHaveBeenCalledWith({ classIds: ['class-done'], registryId: 'AKC' });
  });

  it('asks for initials on a finished, released and printed class once the day is over', () => {
    hook.value = { ...hook.value, rows: buildRows({ dayOver: true, doneSigned: false }) };
    renderAt('?status=all');

    const list = screen.getByRole('list', { name: 'Classes' });
    expect(within(list).getByText("Needs judge's initials")).toBeInTheDocument();
  });

  it('shows no sign-off section for a class still in the ring', () => {
    renderAt('?status=all&classId=class-ring');

    expect(screen.queryByRole('region', { name: 'Judge sign-off' })).not.toBeInTheDocument();
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
