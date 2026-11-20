/**
 * MYK9-2312: the class header says each fact once. The release badge and the phase chip both
 * read "Released" for a released, unprinted class; the header shows it once, and still says
 * "Not released" beside what the class needs before release.
 */
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { render, screen, within } from '@/test/utils/testUtils';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trial-store-types';
import type { SecretaryEntry } from '@/services/database/entries';
import { buildResultsClassRows } from './buildResultsClassRows';
import { ResultsClassDetail } from './ResultsClassDetail';

const SYNC = {
  _version: 1,
  _lastModified: new Date(0),
  _lastModifiedBy: '',
  _syncStatus: 'synced',
} as const;

function buildRow(releasedAt: string | null | undefined, printed: boolean) {
  const [row] = buildResultsClassRows({
    trials: [
      {
        id: 'trial-1',
        showId: 'show-1',
        showName: 'Fall Trial',
        trialDate: '2026-10-10',
        trialNumber: '1',
        status: 'Scheduled',
        ...SYNC,
      } as SyncableTrial,
    ],
    trialClasses: {
      'trial-1': [
        {
          id: 'class-1',
          element: 'Containers',
          level: 'Open',
          section: '',
          judgeId: 'j1',
          judgeName: 'Pat Judge',
          startTime: '09:00',
          status: 'Completed',
          entries: 0,
          ...SYNC,
        } as SyncableTrialClass,
      ],
    },
    verifiedByClassId: new Map(
      releasedAt ? [['class-1', { at: '2026-10-10T15:45:00Z', by: 'auth-me' }]] : []
    ),
    releasedAtByClassId: new Map<string, string | null>(
      releasedAt === undefined ? [] : [['class-1', releasedAt]]
    ),
    paperworkByClassId: new Map([
      [
        'class-1',
        (['results-sheet', 'result-labels'] as const).map(reportId => ({
          reportId,
          label: reportId,
          state: printed ? ('current' as const) : ('unconfirmed' as const),
          printHref: `/shows/show-1/reports?report=${reportId}`,
        })),
      ],
    ]),
    entries: [
      {
        id: 'e-1',
        class_id: 'class-1',
        entry_status: 'confirmed',
        check_in_status: 'checked-in',
        is_scored: true,
        result_status: 'qualified',
        armband: '101',
        final_placement: 1,
        search_time_seconds: 61.25,
        total_faults: 0,
        dog: { id: 'd-1', name: 'Ranger', call_name: 'Rex' },
        handler: 'Jane Doe',
        handler_person: null,
        results_line: 'e-1|line',
      } as unknown as SecretaryEntry,
    ],
  });
  return row!;
}

function renderHeader(releasedAt: string | null | undefined, printed = false) {
  render(
    <Routes>
      <Route
        path="*"
        element={
          <ResultsClassDetail
            showId="show-1"
            row={buildRow(releasedAt, printed)}
            timeZone="America/New_York"
            releasing={false}
            onRelease={vi.fn()}
            onHide={vi.fn()}
            hiding={false}
            onRetry={vi.fn()}
            onUndoVerify={vi.fn()}
            verifying={false}
            online
            onRecordCoinFlip={vi.fn()}
            releaseBlockedReason={null}
            verifyBlockedReason={null}
            currentUserId="auth-me"
          />
        }
      />
    </Routes>
  );
  return within(screen.getByRole('banner'));
}

describe('ResultsClassDetail header chips', () => {
  it('says Released once for a released class whose paperwork is not printed', () => {
    const header = renderHeader('2026-10-10T16:00:00Z');
    expect(header.getAllByText('Released', { exact: true })).toHaveLength(1);
  });

  it('says Not released beside what the class needs before release', () => {
    const header = renderHeader(null);
    expect(header.getByText('Not released', { exact: true })).toBeInTheDocument();
    expect(header.getByText('Ready to release', { exact: true })).toBeInTheDocument();
  });

  it('says once that the release state is unknown', () => {
    const header = renderHeader(undefined);
    expect(header.getByText('Release status unknown', { exact: true })).toBeInTheDocument();
    expect(header.queryByText('Unknown', { exact: true })).toBeNull();
    expect(header.queryByText('Not released', { exact: true })).toBeNull();
  });

  it('still says Released, with its phase, once the paperwork is printed', () => {
    const header = renderHeader('2026-10-10T16:00:00Z', true);
    expect(header.getAllByText('Released', { exact: true })).toHaveLength(1);
    expect(header.getByText("Needs judge's initials", { exact: true })).toBeInTheDocument();
  });
});
