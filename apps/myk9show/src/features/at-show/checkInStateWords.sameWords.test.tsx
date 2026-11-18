/**
 * MYK9-2093: a check-in state reads the same on My Shows and on "Your dogs
 * today". Ringside's entry list reads the same table (CheckInIndicator.words.test).
 */
import { describe, expect, it, vi } from 'vitest';
import { CHECK_IN_STATE_WORDS, checkInStateLabel } from '@myk9/ui';
import { render, screen } from '@/test/utils/testUtils';
import { STATE_WORDS } from '@/pages/MyEntriesPage/modules/classRowStatusText';
import { MyEntryRow } from './MyEntryRow';
import { formatRunQueueState } from '@myk9/ringside/run-queue';
import { WhereToBe } from '@/components/shows/tabs/WhereToBe';
import type { EnrichedShowEntry } from '@/hooks/useShowEntriesForUser';
import { deriveDogChip } from '@/pages/MyEntriesPage/modules/myShowDogState';
import type { MyShowDog } from '@/pages/MyEntriesPage/modules/groupEntriesByShow';
import type { AtShowEntryDetail } from './myAtShowEntryDetails.helpers';

function detail(checkInStatus: AtShowEntryDetail['checkInStatus']): AtShowEntryDetail {
  return {
    entryId: 'entry-1',
    classId: 'class-1',
    dogName: 'Rex',
    armband: '101',
    checkInStatus,
    className: 'Novice Container',
    expectedStartLabel: null,
    isRevisedStart: false,
    hasRunOrder: true,
    isScored: false,
    resultStatus: null,
    resultTimeSeconds: null,
    resultFaults: null,
    isPreliminary: false,
    selfCheckinState: 'allowed',
    trialLabel: null,
  };
}

vi.mock('@/hooks/queries/useShowTrials', () => ({ useShowTrials: () => ({ data: [] }) }));
vi.mock('@/hooks/queries/useMyEntryQueuePlaces', () => ({
  useMyEntryQueuePlaces: () => new Map(),
}));

describe('one set of check-in words', () => {
  it.each(Object.entries(CHECK_IN_STATE_WORDS))(
    'My Shows and Your dogs today say the same word for %s',
    (state, word) => {
      if (state !== 'no-status') {
        expect(STATE_WORDS[state as keyof typeof STATE_WORDS]?.text).toBe(word);
      }
      render(
        <ul>
          <MyEntryRow
            showId="show-1"
            detail={detail(state as AtShowEntryDetail['checkInStatus'])}
            place={undefined}
            placeUpdatedAt={null}
            conflictLabel={undefined}
            onOpenClass={() => undefined}
            onCheckIn={() => undefined}
            checkInPending={false}
          />
        </ul>
      );
      expect(screen.getByText(checkInStateLabel(state) as string)).toBeInTheDocument();
    }
  );
});

function whereToBeEntry(overrides: Partial<EnrichedShowEntry>): EnrichedShowEntry {
  return {
    entryId: 'e1',
    classId: 'c1',
    trialId: 't1',
    dogId: 'd1',
    dogName: 'Maggie',
    armband: '101',
    queue: { kind: 'waiting-unknown' },
    element: 'Container',
    level: 'Novice',
    section: 'A',
    classTitle: 'Container Novice A',
    trialDate: '2026-05-10',
    dayLabel: 'Sunday, May 10',
    trialName: 'Trial 1',
    startTime: '9:00 AM',
    judgeName: 'Smith',
    dogsAhead: 0,
    entryStatus: 'confirmed',
    paymentStatus: 'paid',
    hasResult: false,
    ...overrides,
  };
}

describe('one set of check-in words on the other My Shows surfaces (MYK9-2093)', () => {
  it.each(['in-ring', 'pulled', 'at-gate', 'conflict', 'checked-in'] as const)(
    'the dog-card chip says the shared word for %s',
    state => {
      const dog = { classes: [{ checkInStatus: state }] } as unknown as MyShowDog;
      const chip = deriveDogChip(dog, { isPastShow: false, isShowCancelled: false });
      expect(chip.label).toBe(checkInStateLabel(state));
    }
  );

  it.each(['in-ring', 'pulled'] as const)('Where to be says the shared word for %s', state => {
    render(<WhereToBe entries={[whereToBeEntry({ checkInStatus: state })]} showId="show-1" />);
    expect(screen.getByText(checkInStateLabel(state))).toBeInTheDocument();
  });

  it('Where to be never spells in-ring two ways in one row', () => {
    render(
      <WhereToBe
        entries={[whereToBeEntry({ queue: { kind: 'in-ring' }, checkInStatus: 'in-ring' })]}
        showId="show-1"
      />
    );
    const row = screen.getByRole('link');
    expect(row).not.toHaveTextContent(/in ring/i);
    expect(screen.getAllByText('In the ring').length).toBeGreaterThan(0);
  });

  it('Where to be says plain "Pulled" for a queue that is pulled', () => {
    render(<WhereToBe entries={[whereToBeEntry({ queue: { kind: 'pulled' } })]} showId="show-1" />);
    expect(screen.getByText('Pulled')).toBeInTheDocument();
  });

  it('Where to be adds "at the show" only for a day-of pull', () => {
    render(
      <WhereToBe
        entries={[whereToBeEntry({ queue: { kind: 'pulled' }, checkInStatus: 'pulled' })]}
        showId="show-1"
      />
    );
    expect(screen.getAllByText('Pulled').length).toBeGreaterThan(0);
    expect(screen.getByText('Pulled at the show')).toBeInTheDocument();
  });

  it('Where to be never says "at the show" for a dog scratched before the show', () => {
    const { container } = render(
      <WhereToBe
        entries={[
          whereToBeEntry({
            entryStatus: 'scratched',
            queue: { kind: 'pulled' },
            checkInStatus: 'no-status',
          }),
        ]}
        showId="show-1"
      />
    );
    // Where to be may drop a scratched entry altogether; either way "at the show" is never said.
    expect(container).not.toHaveTextContent(/at the show/i);
    // The run queue itself reads a scratch as plain "Pulled" (runQueue.test.ts, MYK9-632).
    expect(formatRunQueueState({ kind: 'pulled' })).toBe('Pulled');
  });
});
