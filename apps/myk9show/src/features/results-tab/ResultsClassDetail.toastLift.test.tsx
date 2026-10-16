/**
 * MYK9-1217: the "Then" paperwork block of a released class registers toast clearance, but only
 * in the desktop pane. Renders the real detail, so a dropped `ref` or `embedded &&` fails here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import { EmbeddedDetailProvider } from '@/components/layout/embeddedDetail';
import { useActionBarStore, selectReservedBottom } from '@/store/actionBarStore';
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

const CHECKED = { at: '2026-10-10T15:45:00Z', by: 'auth-me' };

function buildRow(released: boolean) {
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
    verifiedByClassId: new Map([['class-1', CHECKED]]),
    releasedAtByClassId: new Map<string, string | null>([
      ['class-1', released ? '2026-10-10T16:00:00Z' : null],
    ]),
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

const reserved = () => selectReservedBottom(useActionBarStore.getState());
const originalRect = HTMLElement.prototype.getBoundingClientRect;

function renderDetail({ embedded, released }: { embedded: boolean; released: boolean }) {
  const detail = (
    <ResultsClassDetail
      showId="show-1"
      row={buildRow(released)}
      timeZone="America/New_York"
      releasing={false}
      onRelease={vi.fn()}
      onRetry={vi.fn()}
      onVerify={vi.fn()}
      onUndoVerify={vi.fn()}
      verifying={false}
      online
      releaseBlockedReason={null}
      verifyBlockedReason={null}
      currentUserId="auth-me"
    />
  );
  return render(
    <Routes>
      <Route
        path="*"
        element={
          embedded ? <EmbeddedDetailProvider value>{detail}</EmbeddedDetailProvider> : detail
        }
      />
    </Routes>
  );
}

describe('ResultsClassDetail toast clearance', () => {
  beforeEach(() => {
    useActionBarStore.setState({ heights: {} });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
    // Every element reports a top 200px above the viewport bottom: inside the toast zone.
    HTMLElement.prototype.getBoundingClientRect = () =>
      ({ top: 520, height: 100, width: 100, left: 0, right: 0, bottom: 0, x: 0, y: 0 }) as DOMRect;
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  });

  it('reserves clearance when embedded and released', () => {
    renderDetail({ embedded: true, released: true });
    expect(reserved()).toBe(200);
  });

  it('reserves nothing on the mobile page (not embedded)', () => {
    renderDetail({ embedded: false, released: true });
    expect(reserved()).toBe(0);
  });

  it('reserves nothing before the results are released', () => {
    renderDetail({ embedded: true, released: false });
    expect(reserved()).toBe(0);
  });
});
