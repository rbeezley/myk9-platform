import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { render, screen } from '@/test/utils/testUtils';
import { MyEntriesTab } from '@/components/shows/tabs/MyEntriesTab';
import type { SubmittedEntryDbRow } from '@/features/exhibitor-entry/submittedEntryProjection';
import type { SyncableShowEntry } from '@/store/entry-store-types';
import { mergeCanonicalEntry, normalizeCanonicalEntry } from './useShowEntriesForUser';

vi.mock('@/store/entryStore', () => ({ useEntryStore: vi.fn() }));
vi.mock('@/hooks/useClassStoreCompat', () => ({ useClassStoreCompat: vi.fn() }));
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: vi.fn() }));
vi.mock('@/hooks/useShowStoreCompat', () => ({ useShowStoreCompat: vi.fn() }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: vi.fn() }));

import { useEntryStore } from '@/store/entryStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useShowStoreCompat } from '@/hooks/useShowStoreCompat';
import { useAuthContext } from '@/hooks/useAuthContext';

const SHOW_ID = 'show-1';
const released: SubmittedEntryDbRow = {
  id: 'entry-1',
  show_id: SHOW_ID,
  class_id: 'class-1',
  dog_id: 'dog-1',
  entry_status: 'confirmed',
  payment_status: 'paid',
  is_scored: true,
  result_status: 'qualified',
  search_time_seconds: 38.5,
  final_placement: null,
  total_faults: 0,
};

function storedEntry(row: SubmittedEntryDbRow): SyncableShowEntry {
  const entry = normalizeCanonicalEntry(row);
  if (!entry) throw new Error('Invalid test entry');
  return entry;
}

function setStored(entry: SyncableShowEntry) {
  vi.mocked(useEntryStore).mockImplementation(selector =>
    selector(
      fromPartial({
        entries: [entry],
        isLoading: false,
        error: null,
        loadEntries: vi.fn(),
      })
    )
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuthContext).mockReturnValue(
    fromPartial({
      userWithRoles: { databaseUserId: 'person-1' },
      isAdmin: false,
      isSecretary: false,
      hasRole: () => false,
    })
  );
  vi.mocked(useClassStoreCompat).mockReturnValue(
    fromPartial({
      classes: [
        {
          id: 'class-1',
          trialId: 'trial-1',
          trialDate: '2020-08-01',
          trial: 'Saturday Trial',
          element: 'Container',
          level: 'Novice',
          section: 'A',
          judge: 'Test Judge',
        },
      ],
    })
  );
  vi.mocked(useDogStoreCompat).mockReturnValue(
    fromPartial({
      dogs: [
        {
          id: 'dog-1',
          ownerId: 'person-1',
          callName: 'Willow',
        },
      ],
    })
  );
  vi.mocked(useShowStoreCompat).mockReturnValue(
    fromPartial({
      shows: [
        {
          id: SHOW_ID,
          clubId: 'club-1',
          assignedJudges: [],
        },
      ],
    })
  );
});

describe('canonical results with existing local entries (MYK9-381)', () => {
  it('renders a newly released qualification and time through the real hook and schedule', () => {
    setStored(storedEntry({ ...released, is_scored: false, result_status: null }));
    render(<MyEntriesTab showId={SHOW_ID} canonicalEntries={[released]} />);

    expect(screen.getByText('Q · 0:38.50')).toBeInTheDocument();
    expect(screen.queryByText('Awaiting results')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Judge Test Judge/).length).toBeGreaterThan(0);
  });

  it('updates corrected times and qualifications on the existing row', () => {
    setStored(storedEntry(released));
    const { rerender } = render(
      <MyEntriesTab
        showId={SHOW_ID}
        canonicalEntries={[{ ...released, search_time_seconds: 41.2 }]}
      />
    );
    expect(screen.getByText('Q · 0:41.20')).toBeInTheDocument();
    expect(screen.queryByText('Q · 0:38.50')).not.toBeInTheDocument();

    rerender(
      <MyEntriesTab
        showId={SHOW_ID}
        canonicalEntries={[{ ...released, result_status: 'not_qualified', total_faults: 1 }]}
      />
    );
    expect(screen.getByText('NQ')).toBeInTheDocument();
    expect(screen.queryByText(/Q ·/)).not.toBeInTheDocument();
  });

  it.each([null, 'pending'])(
    'clears stale Q/time when the canonical result is %s',
    resultStatus => {
      setStored(storedEntry(released));
      const { rerender } = render(<MyEntriesTab showId={SHOW_ID} canonicalEntries={[released]} />);
      expect(screen.getByText('Q · 0:38.50')).toBeInTheDocument();

      rerender(
        <MyEntriesTab
          showId={SHOW_ID}
          canonicalEntries={[
            { ...released, result_status: resultStatus, search_time_seconds: null },
          ]}
        />
      );
      expect(screen.getAllByText('Awaiting results').length).toBeGreaterThan(0);
      expect(screen.queryByText('Q · 0:38.50')).not.toBeInTheDocument();
      expect(screen.queryByText('Qualified')).not.toBeInTheDocument();
    }
  );

  it('clears a locally cached placement while retaining independently released Q/time', () => {
    setStored(storedEntry({ ...released, final_placement: 1 }));
    render(<MyEntriesTab showId={SHOW_ID} canonicalEntries={[released]} />);
    expect(screen.getByText('Q · 0:38.50')).toBeInTheDocument();
    expect(screen.queryByText('1st')).not.toBeInTheDocument();
    expect(
      mergeCanonicalEntry(
        storedEntry(released),
        storedEntry({
          ...released,
          final_placement: 1,
        })
      ).competitionData?.placement
    ).toBeUndefined();
  });

  it('preserves unrelated pending local fields and does not mutate the store row', () => {
    const stored = storedEntry({ ...released, is_scored: false, result_status: null });
    stored._syncStatus = 'pending';
    stored.registrationData.jumpHeight = '20';
    stored.registrationData.preferredJudge = 'Requested Judge';
    const before = structuredClone(stored);
    const merged = mergeCanonicalEntry(storedEntry(released), stored);

    expect(merged.competitionData).toEqual(storedEntry(released).competitionData);
    expect(merged.registrationData.jumpHeight).toBe('20');
    expect(merged.registrationData.preferredJudge).toBe('Requested Judge');
    expect(merged._syncStatus).toBe('pending');
    expect(merged.statusHistory).toBe(stored.statusHistory);
    expect(stored).toEqual(before);
  });
});
