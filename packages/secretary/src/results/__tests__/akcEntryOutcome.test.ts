// packages/secretary/src/results/__tests__/akcEntryOutcome.test.ts
//
// MYK9-323 regression cover. Every status literal in this file is a value the
// applied CHECK constraints on `public.entries` actually permit:
//
//   entry_status     no-status | draft | submitted | paid | confirmed |
//                    checked-in | at-gate | in-ring | competing | completed |
//                    withdrawn | scratched | absent | moved | not_accepted |
//                    pending-payment | promotion-expired | scratch-requested |
//                    scratch_requested | move-up-requested | move_up_requested
//   check_in_status  no-status | checked-in | conflict | pulled | at-gate |
//                    come-to-gate | in-ring | completed
//   result_status    pending | qualified | nq | absent | excused | withdrawn
//
// The bug this pins was invisible because the old fixtures invented their own
// vocabulary ('Q', 'present', 'accepted', 'disqualified') and were internally
// consistent with a mapping that matched none of the real values.

import { describe, it, expect } from 'vitest';
import {
  classifyAKCEntryOutcome,
  akcResultCodesForOutcome,
  tallyAKCClass,
  countUnscoredAKCEntries,
  selectSubmittableAKCEntries,
  parseAKCResultStatus,
  type AKCEntryOutcome,
} from '../formatters/akcEntryOutcome';
import type { AKCResultStatus, AKCSubmissionEntry } from '../types';

function makeEntry(overrides: Partial<AKCSubmissionEntry> = {}): AKCSubmissionEntry {
  return {
    dogName: 'Fluffy',
    breed: 'Border Collie',
    registrationNumber: 'HP12345601',
    handlerName: 'Alice Handler',
    className: 'Novice A - Container',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    resultCode: 'Q',
    searchTimeSeconds: 14.5,
    totalFaults: 0,
    finalPlacement: null,
    armbandNumber: 101,
    trialId: 'trial-1',
    classId: 'class-1',
    dogRegisteredName: 'Acme Fluffy The First',
    dogGender: 'B',
    ownerName: 'Alice Owner',
    ownerAddress: null,
    timeLimitSeconds: 120,
    entryStatus: 'completed',
    checkInStatus: 'completed',
    resultStatus: 'pending',
    ...overrides,
  };
}

function codesFor(entry: AKCSubmissionEntry) {
  return akcResultCodesForOutcome(classifyAKCEntryOutcome(entry), entry.finalPlacement);
}

describe('classifyAKCEntryOutcome', () => {
  it('classifies a qualified run with no placement as qualified, not NQ', () => {
    // THE bug: `result_status` is 'qualified', never 'Q', so this fell through
    // to the NQ fallback and every unplaced qualifier was submitted as NQ.
    const entry = makeEntry({ resultStatus: 'qualified', finalPlacement: null });
    expect(classifyAKCEntryOutcome(entry)).toBe('qualified');
    expect(codesFor(entry)).toEqual({ actionCode: 'CNT', resultCode: 'Q' });
  });

  it('classifies a qualified run placed 1st-4th as placed', () => {
    for (const placement of [1, 2, 3, 4]) {
      const entry = makeEntry({ resultStatus: 'qualified', finalPlacement: placement });
      expect(classifyAKCEntryOutcome(entry)).toBe('placed');
      expect(codesFor(entry)).toEqual({ actionCode: 'PLAC', resultCode: String(placement) });
    }
  });

  it('classifies a qualified run placed outside 1st-4th as a plain qualifier', () => {
    const entry = makeEntry({ resultStatus: 'qualified', finalPlacement: 5 });
    expect(classifyAKCEntryOutcome(entry)).toBe('qualified');
    expect(codesFor(entry)).toEqual({ actionCode: 'CNT', resultCode: 'Q' });
  });

  it('classifies result_status "nq" as not-qualified', () => {
    const entry = makeEntry({ resultStatus: 'nq' });
    expect(classifyAKCEntryOutcome(entry)).toBe('not-qualified');
    expect(codesFor(entry)).toEqual({ actionCode: 'CNT', resultCode: 'NQ' });
  });

  it('classifies result_status "excused" as excused', () => {
    const entry = makeEntry({ resultStatus: 'excused' });
    expect(codesFor(entry)).toEqual({ actionCode: 'EXCU', resultCode: 'EXO' });
  });

  describe('absence', () => {
    // The old mapping looked at `check_in_status === 'absent'`, which that
    // column has never been able to hold. Absence is recorded in one of three
    // real places depending on who recorded it.
    it('reads absence from result_status', () => {
      const entry = makeEntry({ resultStatus: 'absent', checkInStatus: 'no-status' });
      expect(codesFor(entry)).toEqual({ actionCode: 'ABSN', resultCode: 'A' });
    });

    it('reads absence from entry_status', () => {
      const entry = makeEntry({ entryStatus: 'absent', resultStatus: 'pending' });
      expect(codesFor(entry)).toEqual({ actionCode: 'ABSN', resultCode: 'A' });
    });

    it('reads absence from a gate steward pulling the dog', () => {
      const entry = makeEntry({ checkInStatus: 'pulled', resultStatus: 'pending' });
      expect(codesFor(entry)).toEqual({ actionCode: 'ABSN', resultCode: 'A' });
    });
  });

  describe('withdrawal', () => {
    it('reads withdrawal from result_status', () => {
      const entry = makeEntry({ resultStatus: 'withdrawn', entryStatus: 'completed' });
      expect(codesFor(entry)).toEqual({ actionCode: 'WHLD', resultCode: 'EXO' });
    });

    it('reads withdrawal from entry_status', () => {
      const entry = makeEntry({ entryStatus: 'withdrawn', resultStatus: 'pending' });
      expect(codesFor(entry)).toEqual({ actionCode: 'WHLD', resultCode: 'EXO' });
    });

    it('treats a scratched entry as withdrawn', () => {
      const entry = makeEntry({ entryStatus: 'scratched', resultStatus: 'pending' });
      expect(codesFor(entry)).toEqual({ actionCode: 'WHLD', resultCode: 'EXO' });
    });

    it('does NOT treat a pending scratch REQUEST as a scratch', () => {
      // The dog is still entered until a secretary approves the request.
      for (const status of ['scratch-requested', 'scratch_requested']) {
        const entry = makeEntry({ entryStatus: status, resultStatus: 'qualified' });
        expect(classifyAKCEntryOutcome(entry)).toBe('qualified');
      }
    });

    it('outranks a result that was recorded before the withdrawal', () => {
      const entry = makeEntry({
        entryStatus: 'withdrawn',
        resultStatus: 'qualified',
        finalPlacement: 1,
      });
      expect(codesFor(entry)).toEqual({ actionCode: 'WHLD', resultCode: 'EXO' });
    });
  });

  describe('unscored', () => {
    it('classifies the result_status column default as unscored', () => {
      expect(classifyAKCEntryOutcome(makeEntry({ resultStatus: 'pending' }))).toBe('unscored');
    });

    it('classifies a NULL result as unscored', () => {
      expect(classifyAKCEntryOutcome(makeEntry({ resultStatus: null }))).toBe('unscored');
    });

    it('still emits a code so no dog is dropped from the file', () => {
      expect(akcResultCodesForOutcome('unscored', null)).toEqual({
        actionCode: 'CNT',
        resultCode: 'NQ',
      });
    });
  });

  // Found by Codex review. `useAKCSubmissionData` reads every row for the show
  // with no lifecycle filter, so these arrive here. Before this they were
  // emitted to AKC as CNT/NQ runs — a dog reported as failing a class it never
  // competed in — and after the unscored gate landed they would have blocked
  // every submission for the show instead.
  describe('rows that never competed in this class', () => {
    it('excludes each non-participating lifecycle status', () => {
      for (const entryStatus of [
        'draft',
        'pending-payment',
        'promotion-expired',
        'not_accepted',
        'moved',
      ]) {
        const entry = makeEntry({ entryStatus, resultStatus: 'pending' });
        expect(classifyAKCEntryOutcome(entry)).toBe('excluded');
      }
    });

    it('keeps a dog whose result was actually recorded, whatever the lifecycle says', () => {
      // Dropping a SCORED dog is the one direction of this call a re-send
      // cannot repair, so a recorded result always wins.
      const recorded: AKCResultStatus[] = ['qualified', 'nq', 'absent', 'excused', 'withdrawn'];
      for (const resultStatus of recorded) {
        const entry = makeEntry({ entryStatus: 'moved', resultStatus });
        expect(classifyAKCEntryOutcome(entry)).not.toBe('excluded');
      }
    });

    it('keeps an entry that merely has a pending request against it', () => {
      for (const entryStatus of ['scratch-requested', 'move-up-requested', 'move_up_requested']) {
        const entry = makeEntry({ entryStatus, resultStatus: 'qualified' });
        expect(classifyAKCEntryOutcome(entry)).toBe('qualified');
      }
    });

    it('still reports withdrawn, scratched and absent dogs — they held real entries', () => {
      expect(classifyAKCEntryOutcome(makeEntry({ entryStatus: 'withdrawn' }))).toBe('withdrawn');
      expect(classifyAKCEntryOutcome(makeEntry({ entryStatus: 'scratched' }))).toBe('withdrawn');
      expect(classifyAKCEntryOutcome(makeEntry({ entryStatus: 'absent' }))).toBe('absent');
    });

    it('does not let an excluded row block a submission as unscored', () => {
      const entries = [
        makeEntry({ armbandNumber: 1, resultStatus: 'qualified' }),
        makeEntry({ armbandNumber: 2, entryStatus: 'moved', resultStatus: 'pending' }),
        makeEntry({ armbandNumber: 3, entryStatus: 'promotion-expired', resultStatus: 'pending' }),
      ];
      expect(countUnscoredAKCEntries(entries)).toBe(0);
      expect(selectSubmittableAKCEntries(entries)).toHaveLength(1);
    });

    it('keeps excluded rows out of every class tally', () => {
      expect(
        tallyAKCClass([
          makeEntry({ armbandNumber: 1, resultStatus: 'qualified' }),
          makeEntry({ armbandNumber: 2, entryStatus: 'draft', resultStatus: 'pending' }),
        ])
      ).toEqual({ numEntries: 1, numStarters: 1, numQualifying: 1, numWithdrawals: 0 });
    });
  });

  it('folds case and separators in the LIFECYCLE columns', () => {
    // result_status is deliberately NOT folded: it is typed as the union, so a
    // non-canonical literal is a typecheck error rather than a runtime concern.
    expect(classifyAKCEntryOutcome(makeEntry({ entryStatus: 'Not_Accepted' }))).toBe('excluded');
    expect(classifyAKCEntryOutcome(makeEntry({ checkInStatus: 'PULLED' }))).toBe('absent');
  });

  it('covers every value result_status can hold', () => {
    const expected: Record<AKCResultStatus, AKCEntryOutcome> = {
      pending: 'unscored',
      qualified: 'qualified',
      nq: 'not-qualified',
      absent: 'absent',
      excused: 'excused',
      withdrawn: 'withdrawn',
    };
    for (const [resultStatus, outcome] of Object.entries(expected) as [
      AKCResultStatus,
      AKCEntryOutcome,
    ][]) {
      // Neutral lifecycle columns so result_status is the only signal.
      const entry = makeEntry({ resultStatus, entryStatus: 'confirmed', checkInStatus: 'no-status' });
      expect(classifyAKCEntryOutcome(entry)).toBe(outcome);
    }
  });
});

describe('tallyAKCClass', () => {
  it('derives every count from the same classification as the dog rows', () => {
    const tallies = tallyAKCClass([
      makeEntry({ armbandNumber: 1, resultStatus: 'qualified', finalPlacement: 1 }),
      makeEntry({ armbandNumber: 2, resultStatus: 'qualified', finalPlacement: null }),
      makeEntry({ armbandNumber: 3, resultStatus: 'nq' }),
      makeEntry({ armbandNumber: 4, resultStatus: 'absent' }),
      makeEntry({ armbandNumber: 5, entryStatus: 'withdrawn', resultStatus: 'pending' }),
    ]);
    expect(tallies).toEqual({
      numEntries: 4, // 5 minus the withdrawal
      numStarters: 3, // minus the absentee
      numQualifying: 2, // placed + unplaced qualifier
      numWithdrawals: 1,
    });
  });

  it('never double-subtracts a dog that is both withdrawn and absent', () => {
    const tallies = tallyAKCClass([
      makeEntry({ armbandNumber: 1, entryStatus: 'withdrawn', resultStatus: 'absent' }),
      makeEntry({ armbandNumber: 2, resultStatus: 'qualified' }),
    ]);
    expect(tallies.numWithdrawals).toBe(1);
    expect(tallies.numEntries).toBe(1);
    expect(tallies.numStarters).toBe(1);
  });

  it('returns zeroes for an empty class', () => {
    expect(tallyAKCClass([])).toEqual({
      numEntries: 0,
      numStarters: 0,
      numQualifying: 0,
      numWithdrawals: 0,
    });
  });
});

describe('countUnscoredAKCEntries', () => {
  it('counts only entries with no result recorded', () => {
    expect(
      countUnscoredAKCEntries([
        makeEntry({ armbandNumber: 1, resultStatus: 'pending' }),
        makeEntry({ armbandNumber: 2, resultStatus: null }),
        makeEntry({ armbandNumber: 3, resultStatus: 'qualified' }),
        makeEntry({ armbandNumber: 4, resultStatus: 'nq' }),
        // Withdrawn and absent dogs are accounted for — they need no result.
        makeEntry({ armbandNumber: 5, entryStatus: 'withdrawn', resultStatus: 'pending' }),
        makeEntry({ armbandNumber: 6, checkInStatus: 'pulled', resultStatus: 'pending' }),
      ])
    ).toBe(2);
  });

  it('is zero for a fully scored class', () => {
    expect(countUnscoredAKCEntries([makeEntry({ resultStatus: 'qualified' })])).toBe(0);
  });
});

// MYK9-323 AC2. The union type is the guard inside the module; this is the
// boundary that keeps a raw PostgREST read from smuggling past it.
describe('parseAKCResultStatus', () => {
  it('accepts every value the CHECK constraint permits', () => {
    const all: AKCResultStatus[] = ['pending', 'qualified', 'nq', 'absent', 'excused', 'withdrawn'];
    for (const status of all) {
      expect(parseAKCResultStatus(status)).toBe(status);
    }
  });

  it('folds casing and surrounding whitespace', () => {
    expect(parseAKCResultStatus('  Qualified ')).toBe('qualified');
  });

  it('fails closed on anything it does not recognise', () => {
    // 'Q' is the literal that caused this issue. It must not resolve to
    // 'qualified' -- an unrecognised value means "no result recorded", which
    // blocks the submission instead of shipping a guess.
    for (const raw of ['Q', 'disqualified', 'present', '', 'QUALIFIED!']) {
      expect(parseAKCResultStatus(raw)).toBeNull();
    }
    expect(parseAKCResultStatus(null)).toBeNull();
    expect(parseAKCResultStatus(undefined)).toBeNull();
  });
});
