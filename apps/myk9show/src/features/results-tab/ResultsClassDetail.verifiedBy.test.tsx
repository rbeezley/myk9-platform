/**
 * Who checked the scores: a check by someone other than the signed-in user names no role, because
 * the verifier may be a club admin as well as a trial secretary.
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

function buildRow(by: string) {
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
    verifiedByClassId: new Map([['class-1', { at: '2026-10-10T15:45:00Z', by }]]),
    releasedAtByClassId: new Map<string, string | null>([['class-1', null]]),
    paperworkByClassId: new Map(),
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

function renderDetail(by: string) {
  render(
    <Routes>
      <Route
        path="*"
        element={
          <ResultsClassDetail
            showId="show-1"
            row={buildRow(by)}
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

describe('ResultsClassDetail verified line', () => {
  it('says you when the signed-in user checked the scores', () => {
    renderDetail('auth-me');
    expect(screen.getByText(/Scores checked by you/)).toBeInTheDocument();
  });

  it('says someone else, with no role, when another user checked the scores', () => {
    renderDetail('auth-other');
    expect(screen.getByText(/Scores checked by someone else/)).toBeInTheDocument();
    expect(screen.queryByText(/secretary/i)).not.toBeInTheDocument();
  });
});
