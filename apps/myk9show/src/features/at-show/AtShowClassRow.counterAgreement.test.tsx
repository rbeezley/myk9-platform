/**
 * MYK9-645 — the two counters on ONE class-list card must agree.
 *
 * `refreshAtShowClassListEntries` feeds both lines of the same row: the next-up
 * line ("n of m remaining", `AtShowClassRow.tsx` line ~66) and the scored
 * counter ("a / b", line ~140). They were built from two different rules --
 * `buildNextUpPreview` folded out only the non-running trio via the run queue
 * and counted `is_scored` alone, while the card counted raw rows -- so a class
 * of 9 confirmed unscored dogs plus one `moved` entry rendered
 * "10 of 10 remaining" directly above "0 / 9".
 *
 * Both now come from `countEntryAccounting`, the same rule the server's
 * auto-derivation uses. The run ORDER stays on `replicatedRunQueue`.
 */
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import type { ClassEntry } from '@myk9/ringside';
import { render } from '@/test/utils/testUtils';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { AtShowClassRow } from './AtShowClassRow';
import {
  refreshAtShowClassListEntries,
  toClassEntry,
  type AtShowClassGroup,
} from './atShowClassListAdapter';

const CLASS_ID = 'class-1';
const SHOW_ID = 'show-1';

/** 9 confirmed, unscored, one of them in the ring — plus one `moved` entry. */
function nineConfirmedPlusOneMoved(): ReplicatedEntry[] {
  const rows: ReplicatedEntry[] = [];
  for (let i = 1; i <= 9; i += 1) {
    rows.push({
      id: `e${i}`,
      showId: SHOW_ID,
      classId: CLASS_ID,
      armband: String(100 + i),
      entryStatus: 'confirmed',
      checkInStatus: i === 1 ? 'in-ring' : 'checked-in',
      isScored: false,
      runOrder: i,
    } as ReplicatedEntry);
  }
  rows.push({
    id: 'e10',
    showId: SHOW_ID,
    classId: CLASS_ID,
    armband: '110',
    entryStatus: 'moved',
    checkInStatus: 'no-status',
    isScored: false,
    runOrder: 10,
  } as ReplicatedEntry);
  return rows;
}

function refreshedRow(): { entry: ClassEntry; nextUp: AtShowClassGroup['nextUpByClassId'] } {
  const groups: AtShowClassGroup[] = [
    {
      trial: { id: 'trial-1' } as never,
      classes: [
        toClassEntry(
          {
            id: CLASS_ID,
            name: 'Container Novice',
            element: 'Container',
            level: 'Novice',
            classStatus: 'in_progress',
          } as never,
          [],
          new Set()
        ),
      ],
      nextUpByClassId: new Map(),
    },
  ];
  const [group] = refreshAtShowClassListEntries(groups, nineConfirmedPlusOneMoved(), SHOW_ID);
  return { entry: group?.classes[0] as ClassEntry, nextUp: group?.nextUpByClassId as never };
}

describe('AtShowClassRow — the two counters on one card agree (MYK9-645)', () => {
  it('reports 9 expected on both lines for 9 confirmed runners plus one moved entry', () => {
    const { entry, nextUp } = refreshedRow();
    const preview = nextUp.get(CLASS_ID);

    // The card's own pair: the `moved` entry is not expected to run.
    expect(entry.entry_count).toBe(9);
    expect(entry.completed_count).toBe(0);

    // The next-up line's pair, from the same rule.
    expect(preview?.total).toBe(9);
    expect(preview?.remaining).toBe(9);

    render(
      <ul>
        <AtShowClassRow
          entry={entry}
          isExhibitorOnly={false}
          onClick={() => {}}
          trialTimeZone="America/New_York"
          nextUp={preview}
          entryCountsAvailable
        />
      </ul>
    );

    expect(screen.getByText('9 of 9 remaining')).toBeInTheDocument();
    expect(screen.getByText('0 / 9')).toBeInTheDocument();
    expect(screen.queryByText('10 of 10 remaining')).not.toBeInTheDocument();
  });

  it('keeps the run ORDER on the run queue: the in-ring dog and the next armbands still render', () => {
    const { nextUp } = refreshedRow();
    const preview = nextUp.get(CLASS_ID);

    expect(preview?.inRingArmband).toBe('101');
    expect(preview?.nextArmbands).toEqual(['102', '103', '104']);
  });
});
