/**
 * MYK9-1881: the Show the choice again button and the conflict reason stay on screen while offline,
 * when the offline reason takes the usual blocked-reason slot.
 */
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
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

const trial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Fall Trial',
  trialDate: '2026-10-10',
  trialNumber: '1',
  status: 'Scheduled',
  ...SYNC,
} as SyncableTrial;

function buildRow() {
  const [row] = buildResultsClassRows({
    trials: [trial],
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
    verifiedByClassId: new Map([['class-1', { at: null, by: null }]]),
    releasedAtByClassId: new Map<string, string | null>([['class-1', null]]),
    paperworkByClassId: new Map([
      [
        'class-1',
        [
          {
            reportId: 'results-sheet',
            label: 'results-sheet',
            state: 'unconfirmed' as const,
            printHref: '/shows/show-1/reports?report=results-sheet',
          },
        ],
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

const CONFLICT_REASON = 'This class was changed somewhere else.';

function renderDetail({ online }: { online: boolean }) {
  return render(
    <Routes>
      <Route
        path="*"
        element={
          <ResultsClassDetail
            showId="show-1"
            row={buildRow()}
            timeZone="America/New_York"
            releasing={false}
            onRelease={vi.fn()}
            onHide={vi.fn()}
            hiding={false}
            onRetry={vi.fn()}
            onUndoVerify={vi.fn()}
            verifying={false}
            online={online}
            onRecordCoinFlip={vi.fn()}
            releaseBlockedReason={null}
            verifyBlockedReason={CONFLICT_REASON}
            reopenConflictClassId="class-1"
            currentUserId="auth-me"
          />
        }
      />
    </Routes>
  );
}

describe('ResultsClassDetail conflict recovery', () => {
  it('offers the button and the conflict reason while offline, beside the offline reason', () => {
    renderDetail({ online: false });
    expect(screen.getByText('Connect to release from here')).toBeInTheDocument();
    expect(screen.getByText(CONFLICT_REASON)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show the choice again' })).toBeInTheDocument();
  });

  it('shows the conflict reason once when it is the blocked reason', () => {
    renderDetail({ online: true });
    expect(screen.getAllByText(CONFLICT_REASON)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Show the choice again' })).toBeInTheDocument();
  });
});
