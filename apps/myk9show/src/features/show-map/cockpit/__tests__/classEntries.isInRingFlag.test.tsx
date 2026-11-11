import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { buildShowMapTree } from '../../showMapTree';
import { ClassCountTiles } from '../FocusedClassEntries';
import { classEntriesForClass, countClassEntries, runStatusDisplay } from '../cockpitClassEntries';
import { buildStatusLine } from '../scheduleStatusLine';
import type { SecretaryCockpitClass } from '../secretaryCockpitTypes';

const show = { id: 'show-1', name: 'Show', organization: 'AKC' } as never;
const trial = { id: 'trial-1', trialDate: '2026-07-20', trialNumber: '1' } as never;
const cls = { id: 'class-1', trialId: 'trial-1', element: 'Container', level: 'Novice' } as never;

function entryRow(id: string, armband: string, runOrder: number, fields = {}) {
  return {
    id,
    class_id: 'class-1',
    entry_status: 'confirmed',
    armband,
    run_order: runOrder,
    dog: { call_name: `Dog${armband}` },
    ...fields,
  };
}

function rowsFor(entries: ReturnType<typeof entryRow>[]) {
  const tree = buildShowMapTree({
    show,
    trials: [trial],
    classes: [cls],
    entries,
    entryPreviewLimit: Number.POSITIVE_INFINITY,
  });
  return classEntriesForClass('class-1', tree);
}

// The replicated run queue treats `is_in_ring` as in the ring even when check-in is not.
const FLAGGED = [
  entryRow('e1', '101', 1, { is_in_ring: true, check_in_status: 'checked-in' }),
  entryRow('e2', '102', 2),
  entryRow('e3', '103', 3),
];

describe('an entry flagged only by is_in_ring', () => {
  it('is the In ring tile dog and is left out of Next up', () => {
    render(<ClassCountTiles entries={rowsFor(FLAGGED)} />);
    const tile = screen.getByTestId('in-ring-tile');
    expect(tile).toHaveTextContent('Armband 101, Dog101');
    expect(within(tile).queryByText('Nobody in the ring')).toBeNull();
    const next = within(screen.getByRole('list', { name: 'Next up' })).getAllByRole('listitem');
    expect(next.map(item => item.textContent)).toEqual([
      '102Armband 102, Dog102',
      '103Armband 103, Dog103',
    ]);
  });

  it('reads in ring in the table and the counts, and the schedule line names it', () => {
    const rows = rowsFor(FLAGGED);
    expect(runStatusDisplay(rows[0]!).label).toBe('In ring');
    expect(countClassEntries(rows)).toMatchObject({ inRing: 1, stillToRun: 2 });
    const status = buildStatusLine(
      { lifecycle: 'in-progress', entries: rows } as unknown as SecretaryCockpitClass,
      true
    );
    expect(status.text).toContain('Dog101 in ring');
  });

  it('is ignored on a scored dog (stale flag)', () => {
    const rows = rowsFor([
      entryRow('e1', '101', 1, { is_in_ring: true, is_scored: true, result_status: 'qualified' }),
    ]);
    expect(rows[0]!.state).toBe('scored');
  });
});
