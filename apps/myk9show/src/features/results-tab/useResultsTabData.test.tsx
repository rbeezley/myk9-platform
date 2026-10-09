import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen } from '@/test/utils/testUtils';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trial-store-types';
import { buildReportPaperworkDescriptor } from '@/features/show-map/cockpit/buildReportPaperworkDescriptor';
import { useResultsTabData } from './useResultsTabData';

const SYNC = {
  _version: 1,
  _lastModified: new Date(0),
  _lastModifiedBy: '',
  _syncStatus: 'synced',
} as const;

const mocks = vi.hoisted(() => ({
  schedule: {} as Record<string, unknown>,
  entries: {} as Record<string, unknown>,
  prints: {} as Record<string, unknown>,
  reportClasses: [] as Record<string, unknown>[],
}));

// The class source Reports reads (`useReportData`): full class rows, snake_case.
const getClassesByTrialId = vi.hoisted(() => vi.fn());
vi.mock('@/services/database/classes', () => ({ getClassesByTrialId }));

vi.mock('@/pages/secretary/useShowDeskScheduleRead', () => ({
  useShowDeskScheduleRead: () => mocks.schedule,
}));
vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useSecretaryShowEntriesQuery: () => mocks.entries,
}));
vi.mock('@/features/show-map/cockpit/useShowPaperworkPrints', () => ({
  useShowPaperworkPrints: () => mocks.prints,
}));

/** The full class row Reports reads, carrying the release stamp. */
const classRow = (releasedAt: string | null, verifiedAt: string | null = null) => ({
  id: 'class-1',
  trial_id: 'trial-1',
  element: 'Containers',
  level: 'Novice',
  section: '',
  status: 'Completed',
  results_released_at: releasedAt,
  results_verified_at: verifiedAt,
  results_verified_by: verifiedAt ? 'auth-1' : null,
});

const trial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Fall Trial',
  trialDate: '2026-10-10',
  trialNumber: '1',
  status: 'Scheduled',
  ...SYNC,
} as SyncableTrial;
const otherShowTrial = { ...trial, id: 'trial-x', showId: 'show-2' } as SyncableTrial;
const cls = {
  id: 'class-1',
  element: 'Containers',
  level: 'Novice',
  section: '',
  judgeId: 'j',
  judgeName: 'Pat Judge',
  startTime: '09:00',
  status: 'Completed',
  entries: 0,
  ...SYNC,
} as SyncableTrialClass;

function Probe() {
  const data = useResultsTabData('show-1');
  return (
    <div>
      <span data-testid="paperwork">{String(data.paperworkAvailable)}</span>
      <button onClick={data.retry}>retry</button>
      <span data-testid="refresh-failed">{String(data.refreshFailed)}</span>
      <span data-testid="state">{data.readState}</span>
      <span data-testid="rows">
        {data.rows
          .map(row => `${row.id}:${row.phase}:${row.scoredCount}/${row.expectedCount}`)
          .join()}
      </span>
    </div>
  );
}

beforeEach(() => {
  mocks.schedule = {
    trials: [trial, otherShowTrial],
    trialClasses: { 'trial-1': [cls], 'trial-x': [{ ...cls, id: 'class-other' }] },
    hasConfirmedSnapshot: true,
    readFailed: false,
    readPending: false,
    retry: vi.fn(),
  };
  mocks.entries = {
    data: [
      {
        id: 'e1',
        class_id: 'class-1',
        entry_status: 'confirmed',
        check_in_status: 'checked-in',
        is_scored: true,
        result_status: 'qualified',
      },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
  mocks.prints = { data: [], isError: false, syncFailed: false };
  mocks.reportClasses = [classRow(null)];
  getClassesByTrialId.mockReset();
  getClassesByTrialId.mockImplementation(async () => ({ data: mocks.reportClasses, error: null }));
});

describe('useResultsTabData', () => {
  it("returns only this show's classes, with scores from the secretary read and the release stamp from the class rows", async () => {
    mocks.reportClasses = [classRow('2026-10-10T16:00:00Z', '2026-10-10T15:45:00Z')];
    render(<Probe />);

    await vi.waitFor(() =>
      expect(screen.getByTestId('rows')).toHaveTextContent('class-1:released:1/1')
    );
    expect(screen.getByTestId('state')).toHaveTextContent('ready');
    expect(screen.getByTestId('rows')).not.toHaveTextContent('class-other');
  });

  it('treats a settled schedule with no trials as an empty show, not an unavailable read', async () => {
    mocks.schedule = { ...mocks.schedule, trials: [], trialClasses: {} };
    render(<Probe />);

    await vi.waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready'));
    expect(screen.getByTestId('rows')).toHaveTextContent('');
    expect(getClassesByTrialId).not.toHaveBeenCalled();
  });

  it('offers Release only for a confirmed-null release stamp on a class checked against the paper', async () => {
    mocks.reportClasses = [classRow(null, '2026-10-10T15:45:00Z')];
    render(<Probe />);

    await vi.waitFor(() =>
      expect(screen.getByTestId('rows')).toHaveTextContent('class-1:ready-to-release:1/1')
    );
  });

  it('holds a class whose stored check is empty at needs-checking, read from the class row', async () => {
    mocks.reportClasses = [classRow(null)];
    render(<Probe />);

    await vi.waitFor(() =>
      expect(screen.getByTestId('rows')).toHaveTextContent('class-1:needs-checking:1/1')
    );
  });

  it('reads a class with no row in the settled class read as release-unknown, not unreleased', async () => {
    mocks.reportClasses = [{ ...classRow(null), id: 'some-other-class' }];
    render(<Probe />);

    await vi.waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready'));
    expect(screen.getByTestId('rows')).toHaveTextContent('class-1:release-unknown:1/1');
  });

  it('fails the tab and offers no Release for any class when the class read fails', async () => {
    getClassesByTrialId.mockImplementation(async () => ({ data: null, error: new Error('boom') }));
    render(<Probe />);

    await vi.waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('failed'));
    expect(screen.getByTestId('rows')).toHaveTextContent('class-1:release-unknown:1/1');
    expect(screen.getByTestId('rows')).not.toHaveTextContent('ready-to-release');
  });

  it('reports a paused entries read as unavailable, never as an empty show', async () => {
    mocks.entries = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
    render(<Probe />);

    await vi.waitFor(() => expect(getClassesByTrialId).toHaveBeenCalled());
    await vi.waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('unavailable'));
  });

  it('reports failed and loading reads as such', () => {
    mocks.entries = { data: undefined, isLoading: false, isError: true, refetch: vi.fn() };
    const { unmount } = render(<Probe />);
    expect(screen.getByTestId('state')).toHaveTextContent('failed');
    unmount();

    mocks.entries = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
    render(<Probe />);
    expect(screen.getByTestId('state')).toHaveTextContent('loading');
  });

  it('treats a failed print sync as unknown, so a released class is not read as printed', async () => {
    mocks.reportClasses = [classRow('2026-10-10T16:00:00Z', '2026-10-10T15:45:00Z')];
    mocks.prints = { data: [], isError: false, syncFailed: true };
    render(<Probe />);

    await vi.waitFor(() =>
      expect(screen.getByTestId('rows')).toHaveTextContent('class-1:released:1/1')
    );
  });

  it('reads a print confirmed on Reports as current, using the same class rows Reports fingerprints', async () => {
    const reportClass = {
      id: 'class-1',
      trial_id: 'trial-1',
      element: 'Containers',
      level: 'Novice',
      section: '',
      status: 'Completed',
      judge_name: 'Pat Judge',
      time_limit_seconds: 180,
      num_areas: 2,
      num_hides: 3,
      results_released_at: '2026-10-10T16:00:00Z',
      results_verified_at: '2026-10-10T15:45:00Z',
    };
    mocks.reportClasses = [reportClass];
    mocks.schedule = {
      ...mocks.schedule,
      trialClasses: { 'trial-1': [{ ...cls, judgeSignedOffAt: '2026-10-10T21:00:00Z' }] },
    };
    const entries = mocks.entries.data as Record<string, unknown>[];
    const confirm = (reportId: 'results-sheet' | 'result-labels') => {
      const descriptor = buildReportPaperworkDescriptor({
        reportId,
        scope: { kind: 'class', showId: 'show-1', trialId: 'trial-1', classId: 'class-1' },
        classes: [reportClass] as never,
        entries: entries as never,
      })!;
      return {
        id: `print-${reportId}`,
        reportId,
        scopeKind: 'class',
        classId: 'class-1',
        trialId: 'trial-1',
        coverage: descriptor.coverage,
        fingerprint: descriptor.fingerprint,
        printedAt: '2026-10-10T17:00:00Z',
        printedByName: 'Sec',
      };
    };
    mocks.prints = {
      data: [confirm('results-sheet'), confirm('result-labels')],
      isError: false,
      syncFailed: false,
    };
    render(<Probe />);

    await vi.waitFor(() =>
      expect(screen.getByTestId('rows')).toHaveTextContent('class-1:done:1/1')
    );
  });

  it('keeps the loaded snapshot and warns when a background refresh fails', async () => {
    mocks.schedule = { ...mocks.schedule, readFailed: true };
    mocks.entries = { ...mocks.entries, isError: true };
    render(<Probe />);

    await vi.waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready'));
    expect(screen.getByTestId('refresh-failed')).toHaveTextContent('true');
    expect(screen.getByTestId('rows')).toHaveTextContent('class-1');
  });

  it('shows the full failure only when there is no data at all', () => {
    mocks.schedule = { ...mocks.schedule, readFailed: true, hasConfirmedSnapshot: false };
    render(<Probe />);
    expect(screen.getByTestId('state')).toHaveTextContent('failed');
  });

  it('reports a class-read failure as failed, and Retry refetches the class rows', async () => {
    getClassesByTrialId.mockImplementation(async () => ({ data: null, error: new Error('boom') }));
    const { user } = render(<Probe />);

    await vi.waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('failed'));
    expect(screen.getByTestId('paperwork')).toHaveTextContent('false');
    const callsBefore = getClassesByTrialId.mock.calls.length;

    getClassesByTrialId.mockImplementation(async () => ({
      data: mocks.reportClasses,
      error: null,
    }));
    mocks.reportClasses = [classRow('2026-10-10T16:00:00Z', '2026-10-10T15:45:00Z')];
    await user.click(screen.getByRole('button', { name: 'retry' }));

    await vi.waitFor(() =>
      expect(getClassesByTrialId.mock.calls.length).toBeGreaterThan(callsBefore)
    );
    await vi.waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready'));
    expect(screen.getByTestId('paperwork')).toHaveTextContent('true');
  });
});
