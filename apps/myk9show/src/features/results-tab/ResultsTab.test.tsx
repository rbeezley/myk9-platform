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
    results_line: `${id}|line`,
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

/** `dayOver` finishes the judge's last class; `doneSigned: false` leaves Advanced un-initialed. */
const CHECKED = { at: '2026-10-10T15:45:00Z', by: 'auth-me' };

/** `checked: false` leaves Novice at Needs checking; `releasedChecked: false` un-checks Open. */
function buildRows({
  dayOver = false,
  doneSigned = true,
  readyStatus = 'Completed',
  checked = true,
  releasedChecked = true,
} = {}) {
  return buildResultsClassRows({
    trials: [trial],
    trialClasses: {
      'trial-1': [
        { ...level('class-ready', 'Novice', '08:00'), status: readyStatus } as SyncableTrialClass,
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
      ['class-ready', checked ? CHECKED : { at: null, by: null }],
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

const serverCheck = vi.hoisted(() => ({
  read: vi.fn(async (_id: string) => '2026-10-10T15:45:00Z'),
}));
vi.mock('@/features/show-map/resultsVerifiedMutations', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/show-map/resultsVerifiedMutations')>()),
  readServerResultsVerifiedAt: serverCheck.read,
}));
const unsynced = vi.hoisted(() => ({ value: false as boolean | null }));
const unsyncedNow = vi.hoisted(() => ({ check: vi.fn(async (_id: string) => false) }));
vi.mock('./useClassUnsyncedScores', () => ({
  useClassUnsyncedScores: () => unsynced.value,
  classHasUnsyncedScores: unsyncedNow.check,
}));
const refreshClass = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: toastError }),
}));
const verifyMutate = vi.hoisted(() => vi.fn(async (_input: unknown) => undefined));
const undoMutate = vi.hoisted(() => vi.fn());
vi.mock('@/features/show-map/useResultsVerifiedMutations', () => ({
  useResultsVerifiedMutations: () => ({
    verifyAsync: verifyMutate,
    undo: undoMutate,
    isPending: false,
    refreshClass,
  }),
}));
const net = vi.hoisted(() => ({ online: true }));
vi.mock('@/hooks/useNetworkStatus', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useNetworkStatus')>()),
  useIsOnline: () => net.online,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'auth-me' } }) }));
const recordSignOff = vi.hoisted(() => vi.fn());
const clearSignOff = vi.hoisted(() => vi.fn());
vi.mock('@/features/show-map/useJudgeSignOffMutations', () => ({
  useJudgeSignOffMutations: () => ({ recordSignOff, clearSignOff, isPending: false }),
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
  recordSignOff.mockReset();
  verifyMutate.mockReset();
  serverCheck.read.mockReset();
  serverCheck.read.mockResolvedValue('2026-10-10T15:45:00Z');
  unsynced.value = false;
  unsyncedNow.check.mockReset();
  unsyncedNow.check.mockResolvedValue(false);
  refreshClass.mockReset();
  toastError.mockReset();
  verifyMutate.mockResolvedValue(undefined);
  undoMutate.mockReset();
  net.online = true;
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
      // Every class released, printed and initialed: the phase a finished class settles in.
      phase: 'done' as const,
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

  it('an all-absent Completed class owes the sign-off: Needs me lists it and the banner waits', () => {
    const build = (judgeSignedOffAt: string | null) =>
      buildResultsClassRows({
        trials: [trial],
        trialClasses: {
          'trial-1': [{ ...level('c1', 'Novice', '08:00'), judgeSignedOffAt }],
        },
        releasedAtByClassId: new Map([['c1', null]]),
        paperworkByClassId: new Map(),
        entries: [entry('e1', 'c1', { entry_status: 'absent' })],
      });

    hook.value = { ...hook.value, rows: build(null) };
    const first = renderAt();
    expect(screen.getByRole('link', { name: 'Initials: Containers Novice' })).toBeInTheDocument();
    expect(screen.queryByText('Every class is released and signed off')).not.toBeInTheDocument();
    first.unmount();

    hook.value = { ...hook.value, rows: build('2026-10-10T21:00:00Z') };
    renderAt('?status=all');
    expect(screen.getByText('Every class is released and signed off')).toBeInTheDocument();
  });

  it('holds the banner back while a class holding only unaccepted entries is still to run', () => {
    hook.value = {
      ...hook.value,
      rows: buildResultsClassRows({
        trials: [trial],
        trialClasses: {
          'trial-1': [
            { ...level('c1', 'Novice', '08:00'), judgeSignedOffAt: '2026-10-10T21:00:00Z' },
            { ...level('c2', 'Open', '13:00'), status: 'Scheduled' } as SyncableTrialClass,
          ],
        },
        releasedAtByClassId: new Map([
          ['c1', '2026-10-10T16:00:00Z'],
          ['c2', null],
        ]),
        paperworkByClassId: new Map(),
        entries: [
          entry('e1', 'c1'),
          entry('e2', 'c2', {
            entry_status: 'pending',
            is_scored: false,
            result_status: 'pending',
          }),
        ],
      }),
    };
    renderAt();

    expect(screen.queryByText('Every class is released and signed off')).not.toBeInTheDocument();
  });

  it('holds the banner back when a released, signed class has been reopened by a late entry', () => {
    const rows = buildResultsClassRows({
      trials: [trial],
      trialClasses: {
        'trial-1': [
          { ...level('c1', 'Novice', '08:00'), judgeSignedOffAt: '2026-10-10T21:00:00Z' },
        ],
      },
      releasedAtByClassId: new Map([['c1', '2026-10-10T16:00:00Z']]),
      paperworkByClassId: new Map(),
      // The class was complete when released and signed; a new entry arrived unscored.
      entries: [
        entry('e1', 'c1'),
        entry('e2', 'c1', { is_scored: false, result_status: 'pending' }),
      ],
    });
    expect(rows[0]).toMatchObject({ phase: 'in-ring' });
    hook.value = { ...hook.value, rows };
    renderAt();

    expect(screen.queryByText('Every class is released and signed off')).not.toBeInTheDocument();
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
      '/scoring/classes/class-ready/entries?entryId=e-ready&mode=split'
    );

    await user.click(screen.getByRole('button', { name: 'Release results' }));

    await waitFor(() => expect(releaseMutate).toHaveBeenCalledTimes(1));
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

describe('ResultsTab judge sign-off: classes not marked complete', () => {
  it('shows the section row as "Mark complete first" with the link, instead of hiding Record silently', () => {
    hook.value = { ...hook.value, rows: buildRows({ dayOver: true, readyStatus: 'In Progress' }) };
    renderAt('?status=all&classId=class-done');

    const section = screen.getByRole('region', { name: 'Judge sign-off' });
    expect(
      within(section).getByRole('link', { name: 'Mark complete first: Containers Novice' })
    ).toHaveAttribute('href', '/shows/show-1?focus=class-ready');
    // The classes that can be recorded still can: only the one needing completion is held back.
    expect(within(section).getByRole('button', { name: /^Record initials/ })).toBeInTheDocument();
  });

  it('with only the unfinished-status class left to record, says why there is nothing to press', () => {
    const rows = buildRows({ dayOver: true, readyStatus: 'In Progress' }).filter(
      row => row.id === 'class-ready'
    );
    hook.value = { ...hook.value, rows };
    renderAt('?status=all&classId=class-ready');

    const section = screen.getByRole('region', { name: 'Judge sign-off' });
    expect(
      within(section).queryByRole('button', { name: /^Record initials/ })
    ).not.toBeInTheDocument();
    expect(within(section).getByRole('link', { name: /Mark complete first/ })).toBeInTheDocument();
  });
});

describe('ResultsTab judge sign-off: a day across trials', () => {
  const trial2 = { ...trial, id: 'trial-2', trialNumber: '2' } as SyncableTrial;
  const crossTrialRows = () =>
    buildResultsClassRows({
      trials: [trial, trial2],
      trialClasses: {
        'trial-1': [
          { ...level('c1', 'Novice', '08:00'), judgeSignedOffAt: '2026-10-10T21:00:00Z' },
        ],
        'trial-2': [
          { ...level('c2', 'Novice', '08:00'), judgeSignedOffAt: '2026-10-10T21:00:00Z' },
        ],
      },
      releasedAtByClassId: new Map([
        ['c1', '2026-10-10T16:00:00Z'],
        ['c2', '2026-10-10T16:00:00Z'],
      ]),
      paperworkByClassId: new Map(),
      entries: [entry('e1', 'c1'), entry('e2', 'c2')],
    });

  it('says which trial each row is, in the row and in the Undo label', async () => {
    hook.value = { ...hook.value, rows: crossTrialRows(), trials: [trial, trial2] };
    const { user } = renderAt('?status=all&classId=c1');

    const section = screen.getByRole('region', { name: 'Judge sign-off' });
    expect(within(section).getByText(/Trial 1/)).toBeInTheDocument();
    expect(within(section).getByText(/Trial 2/)).toBeInTheDocument();
    const undoTwo = within(section).getByRole('button', {
      name: 'Undo initials: Containers Novice, Trial 2',
    });
    expect(
      within(section).getByRole('button', { name: 'Undo initials: Containers Novice, Trial 1' })
    ).toBeInTheDocument();
    await user.click(undoTwo);
    expect(clearSignOff).toHaveBeenCalledWith({ classIds: ['c2'], registryId: 'AKC' });
  });

  it('stays quiet when the whole day is in one trial', () => {
    renderAt('?status=all&classId=class-done');

    const section = screen.getByRole('region', { name: 'Judge sign-off' });
    expect(within(section).queryByText(/Trial 1/)).not.toBeInTheDocument();
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
      // No judge: each class is a day of its own (the shared rule keys it by class).
      judgeDayKey: `class:${row.id}`,
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

describe('ResultsTab paper check', () => {
  const unchecked = () => buildRows({ checked: false });
  const tick = (user: { click: (el: Element) => Promise<void> }) =>
    user.click(screen.getByRole('checkbox', { name: 'Rex matches the paper' }));

  it('keeps Release disabled until every dog is ticked and the scores are confirmed', async () => {
    hook.value = { ...hook.value, rows: unchecked() };
    const { user } = renderAt('?status=all&classId=class-ready');

    expect(screen.getByText('Check the scores against the paper')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Release results' })).toBeDisabled();
    const confirm = screen.getByRole('button', { name: 'Scores match the paper' });
    expect(confirm).toBeDisabled();

    await tick(user);
    expect(confirm).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Release results' })).toBeDisabled();

    await user.click(confirm);
    expect(verifyMutate).toHaveBeenCalledWith({
      classId: 'class-ready',
      trialId: 'trial-1',
      showId: 'show-1',
      canonical: hook.value.rows.find(row => row.id === 'class-ready')!.resultsCanonical,
    });
    expect(releaseMutate).not.toHaveBeenCalled();
  });

  it('sends the results text the ticks were made against, not whatever is displayed at click time', async () => {
    hook.value = { ...hook.value, rows: unchecked() };
    const { user } = renderAt('?status=all&classId=class-ready');
    await tick(user);
    const ticked = hook.value.rows.find(row => row.id === 'class-ready')!.resultsCanonical;

    // The ticks are the only record of what was looked at.
    await user.click(screen.getByRole('button', { name: 'Scores match the paper' }));
    expect(verifyMutate).toHaveBeenCalledWith(expect.objectContaining({ canonical: ticked }));
  });

  it('a correction that changes the displayed rows lapses every tick', async () => {
    hook.value = { ...hook.value, rows: unchecked() };
    const { user, rerender } = renderAt('?status=all&classId=class-ready');
    await tick(user);
    expect(screen.getByRole('button', { name: 'Scores match the paper' })).toBeEnabled();

    // A download changes a hashed column that is not shown (same visible row, new canonical text).
    hook.value = {
      ...hook.value,
      rows: unchecked().map(row =>
        row.id === 'class-ready' ? { ...row, resultsCanonical: `${row.resultsCanonical}!` } : row
      ),
    };
    rerender(
      <Routes>
        <Route path="/shows/:id/results" element={<ResultsTab />} />
      </Routes>
    );

    expect(screen.getByRole('checkbox', { name: 'Rex matches the paper' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Scores match the paper' })).toBeDisabled();
  });

  it('a corrected score needs checking again: a tick is only good for the result it was made on', async () => {
    hook.value = { ...hook.value, rows: unchecked() };
    const { user, rerender } = renderAt('?status=all&classId=class-ready');
    await tick(user);

    hook.value = {
      ...hook.value,
      rows: unchecked().map(row =>
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

    expect(screen.getByRole('checkbox', { name: 'Rex matches the paper' })).not.toBeChecked();
  });

  it('when the server says the scores moved (MK015), the ticks start over', async () => {
    verifyMutate.mockRejectedValueOnce({ code: 'MK015', message: 'changed' });
    hook.value = { ...hook.value, rows: unchecked() };
    const { user } = renderAt('?status=all&classId=class-ready');
    await tick(user);
    await user.click(screen.getByRole('button', { name: 'Scores match the paper' }));

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Rex matches the paper' })).not.toBeChecked()
    );
  });

  it('keeps ticks when the save fails for any other reason', async () => {
    verifyMutate.mockRejectedValueOnce(new Error('network down'));
    hook.value = { ...hook.value, rows: unchecked() };
    const { user } = renderAt('?status=all&classId=class-ready');
    await tick(user);
    await user.click(screen.getByRole('button', { name: 'Scores match the paper' }));

    await waitFor(() => expect(verifyMutate).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('checkbox', { name: 'Rex matches the paper' })).toBeChecked();
  });

  it('offline: dogs can still be ticked, but saving the check waits for a connection', async () => {
    net.online = false;
    hook.value = { ...hook.value, rows: unchecked() };
    const { user } = renderAt('?status=all&classId=class-ready');
    await tick(user);

    expect(screen.getByRole('checkbox', { name: 'Rex matches the paper' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Scores match the paper' })).toBeDisabled();
    expect(screen.getByText('Connect to save the check')).toBeInTheDocument();
    expect(verifyMutate).not.toHaveBeenCalled();
  });

  it('offline: a saved check cannot be undone until the connection is back', () => {
    net.online = false;
    renderAt('?status=all&classId=class-ready');

    expect(screen.getByRole('button', { name: 'Undo check' })).toBeDisabled();
  });

  it('a class not marked Completed gets a hint to Overview instead of the checklist', () => {
    hook.value = {
      ...hook.value,
      rows: buildRows({ checked: false, readyStatus: 'In Progress' }),
    };
    renderAt('?status=all&classId=class-ready');

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Scores match the paper' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mark Class Complete on Overview/ })).toHaveAttribute(
      'href',
      '/shows/show-1?focus=class-ready'
    );
  });

  it('a checked class shows who checked it, offers Release, and can take the check back', async () => {
    const { user } = renderAt('?status=all&classId=class-ready');

    expect(screen.getByText(/Scores checked against the paper by you/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo check' }));
    expect(undoMutate).toHaveBeenCalledWith({ classId: 'class-ready', trialId: 'trial-1' });
  });

  it('a released class whose check was undone shows the checklist again, and no second Release', async () => {
    media.wide = true;
    hook.value = { ...hook.value, rows: buildRows({ releasedChecked: false }) };
    const { user } = renderAt('?status=all&classId=class-released');

    expect(screen.getByText('Check the scores against the paper')).toBeInTheDocument();
    expect(screen.getByText(/already released/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Release results' })).not.toBeInTheDocument();
    await tick(user);
    expect(screen.getByRole('button', { name: 'Scores match the paper' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Check scores: Containers Open' })).toBeInTheDocument();
  });

  it('never releases a class that is not checked', () => {
    hook.value = { ...hook.value, rows: unchecked() };
    renderAt('?status=all&classId=class-ready');

    expect(screen.getByRole('button', { name: 'Release results' })).toBeDisabled();
    expect(releaseMutate).not.toHaveBeenCalled();
  });
});

describe('ResultsTab Release asks the server', () => {
  it('releases once when the server says the class is checked', async () => {
    const { user } = renderAt('?status=all&classId=class-ready');

    await user.click(screen.getByRole('button', { name: 'Release results' }));

    await waitFor(() => expect(releaseMutate).toHaveBeenCalledTimes(1));
    expect(serverCheck.read).toHaveBeenCalledWith('class-ready');
  });

  it('does not queue the release when a correction landed while the server was being asked', async () => {
    // The hook value was fine at click time; the direct re-check after the read finds the write.
    let answer: (value: string) => void = () => undefined;
    serverCheck.read.mockImplementation(() => new Promise<string>(resolve => (answer = resolve)));
    const { user } = renderAt('?status=all&classId=class-ready');
    await user.click(screen.getByRole('button', { name: 'Release results' }));
    unsyncedNow.check.mockResolvedValue(true);

    answer('2026-10-10T15:45:00Z');

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Waiting for score changes to sync')
    );
    expect(unsyncedNow.check).toHaveBeenCalledWith('class-ready');
    expect(releaseMutate).not.toHaveBeenCalled();
  });

  it('while the server is being asked, Undo check and the confirm are disabled', async () => {
    serverCheck.read.mockImplementation(() => new Promise<string>(() => undefined));
    const { user } = renderAt('?status=all&classId=class-ready');

    await user.click(screen.getByRole('button', { name: 'Release results' }));

    expect(await screen.findByRole('button', { name: 'Undo check' })).toBeDisabled();
  });

  it('Undo check stays disabled through the whole preflight, including the unsynced re-check', async () => {
    let finishUnsynced: (value: boolean) => void = () => undefined;
    unsyncedNow.check.mockImplementation(
      () => new Promise<boolean>(resolve => (finishUnsynced = resolve))
    );
    const { user } = renderAt('?status=all&classId=class-ready');
    await user.click(screen.getByRole('button', { name: 'Release results' }));
    // The server read is answered; the re-check is still pending.
    await waitFor(() => expect(unsyncedNow.check).toHaveBeenCalledWith('class-ready'));

    expect(screen.getByRole('button', { name: 'Undo check' })).toBeDisabled();

    finishUnsynced(false);
    await waitFor(() => expect(releaseMutate).toHaveBeenCalledTimes(1));
  });

  it('does not release when the server says the check is gone, tells the user, and refreshes the class', async () => {
    serverCheck.read.mockResolvedValue(null as never);
    const { user } = renderAt('?status=all&classId=class-ready');

    await user.click(screen.getByRole('button', { name: 'Release results' }));

    await waitFor(() => expect(refreshClass).toHaveBeenCalledWith('trial-1'));
    expect(releaseMutate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      'This class needs checking again — the scores changed.'
    );
  });

  it('does not release when the server cannot be asked: unknown is never "checked"', async () => {
    serverCheck.read.mockRejectedValue(new Error('down'));
    const { user } = renderAt('?status=all&classId=class-ready');

    await user.click(screen.getByRole('button', { name: 'Release results' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Could not check this class. Try again.')
    );
    expect(releaseMutate).not.toHaveBeenCalled();
  });

  it('is disabled offline, with the reason; Print and ticks are untouched', () => {
    net.online = false;
    renderAt('?status=all&classId=class-ready');

    expect(screen.getByRole('button', { name: 'Release results' })).toBeDisabled();
    expect(screen.getByText('Connect to release from here')).toBeInTheDocument();
    expect(serverCheck.read).not.toHaveBeenCalled();
  });

  it('is disabled while a score change of the class is still waiting to sync, and again enabled after the ack', () => {
    unsynced.value = true;
    const first = renderAt('?status=all&classId=class-ready');
    expect(screen.getByRole('button', { name: 'Release results' })).toBeDisabled();
    expect(screen.getByText('Waiting for score changes to sync')).toBeInTheDocument();
    first.unmount();

    unsynced.value = false;
    renderAt('?status=all&classId=class-ready');
    expect(screen.getByRole('button', { name: 'Release results' })).toBeEnabled();
  });

  it('is disabled until the unsynced check has been read (unknown is not "nothing waiting")', () => {
    unsynced.value = null;
    renderAt('?status=all&classId=class-ready');

    expect(screen.getByRole('button', { name: 'Release results' })).toBeDisabled();
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
