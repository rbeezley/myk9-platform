import { describe, expect, it } from 'vitest';
import type { EntryFormDog, EntryFormTrial } from '@/lib/reports/entryFormTypes';
import { computeUKCEntryFormGridMarks } from '../ukcNoseworkEntryFormGrid';

const TRIALS: EntryFormTrial[] = [
  { id: 'trial-1', date: '2026-10-10', trialNumber: 'Trial 1' },
  { id: 'trial-2', date: '2026-10-10', trialNumber: 'Trial 2' },
];

function entry(overrides: Partial<EntryFormDog['entries'][number]>): EntryFormDog['entries'][number] {
  return {
    id: 'entry-1',
    trialId: 'trial-1',
    classId: 'class-1',
    element: 'Container',
    level: 'Novice',
    section: null,
    armband: 101,
    handler: null,
    handlerId: null,
    submittedAt: null,
    entryStatus: 'confirmed',
    ...overrides,
  };
}

describe('computeUKCEntryFormGridMarks — MYK9-845 status filtering', () => {
  it('marks an active entry (Trial bracket + element/level cell)', () => {
    const marks = computeUKCEntryFormGridMarks({ entries: [entry({})] }, TRIALS);
    expect(marks).toHaveLength(2);
  });

  it('does not mark a withdrawn entry', () => {
    const marks = computeUKCEntryFormGridMarks(
      { entries: [entry({ id: 'entry-1', entryStatus: 'withdrawn' })] },
      TRIALS
    );
    expect(marks).toHaveLength(0);
  });

  it('does not mark a scratched entry', () => {
    const marks = computeUKCEntryFormGridMarks(
      { entries: [entry({ id: 'entry-1', entryStatus: 'scratched' })] },
      TRIALS
    );
    expect(marks).toHaveLength(0);
  });

  it('does not mark a not-accepted entry', () => {
    const marks = computeUKCEntryFormGridMarks(
      { entries: [entry({ id: 'entry-1', entryStatus: 'not_accepted' })] },
      TRIALS
    );
    expect(marks).toHaveLength(0);
  });

  it('shows only the current class for a dog with a superseded move-up pair', () => {
    // The Novice run was moved up to Advanced Container: the superseded
    // source entry carries entry_status = 'moved' and must not be marked,
    // only the live Advanced destination should draw a mark.
    const marks = computeUKCEntryFormGridMarks(
      {
        entries: [
          entry({
            id: 'entry-novice-superseded',
            trialId: 'trial-1',
            element: 'Container',
            level: 'Novice',
            entryStatus: 'moved',
          }),
          entry({
            id: 'entry-advanced-current',
            trialId: 'trial-1',
            element: 'Container',
            level: 'Advanced',
            entryStatus: 'confirmed',
          }),
        ],
      },
      TRIALS
    );

    // Trial 1 bracket + the Advanced/Container cell for the live entry only —
    // the superseded Novice row produces no marks at all.
    expect(marks).toHaveLength(2);
    const yValues = new Set(marks.map(m => m.y));
    expect(yValues.size).toBe(2);
  });

  it('still marks an entry with no recognized status (e.g. undefined/null)', () => {
    const marks = computeUKCEntryFormGridMarks(
      { entries: [entry({ id: 'entry-1', entryStatus: null })] },
      TRIALS
    );
    expect(marks).toHaveLength(2);
  });

  it('does not let a filtered-out entry consume one of the six grid rows', () => {
    // Six withdrawn entries followed by one active entry: the active entry
    // should still land on row 0 (its own trial bracket Y), not be pushed
    // past MAX_GRID_ROWS by the withdrawn rows ahead of it.
    const withdrawnEntries = Array.from({ length: 6 }, (_, i) =>
      entry({ id: `withdrawn-${i}`, entryStatus: 'withdrawn' })
    );
    const activeEntry = entry({ id: 'active-1', entryStatus: 'confirmed' });

    const marks = computeUKCEntryFormGridMarks(
      { entries: [...withdrawnEntries, activeEntry] },
      TRIALS
    );
    expect(marks).toHaveLength(2);
  });
});
