/**
 * MYK9-2093: a check-in state reads the same on My Shows and on "Your dogs
 * today". Ringside's entry list reads the same table (CheckInIndicator.words.test).
 */
import { describe, expect, it } from 'vitest';
import { CHECK_IN_STATE_WORDS, checkInStateLabel } from '@myk9/ui';
import { render, screen } from '@/test/utils/testUtils';
import { STATE_WORDS } from '@/pages/MyEntriesPage/modules/classRowStatusText';
import { MyEntryRow } from './MyEntryRow';
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
