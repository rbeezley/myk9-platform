/** MYK9-1162: result labels never print for an entry awaiting a registration number. */
import { render } from '@testing-library/react';
import { fromAny } from '@total-typescript/shoehorn';
import { describe, expect, it, vi } from 'vitest';
import { ResultLabelsReport } from '../ResultLabelsReport';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

const prepared = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock('@/lib/labels/resultLabelData', () => ({
  prepareResultLabelItems: (entries: Array<{ id: string }>) => {
    prepared.ids = entries.map(entry => entry.id);
    return [];
  },
}));

const trials = fromAny<DbTrial[], unknown>([
  { id: 'trial-1', trial_number: 1, date: '2026-05-11', registry_id: 'AKC' },
]);
const classes = [
  { id: 'class-1', trial_id: 'trial-1', element: 'Buried', level: 'Novice', section: '' },
] as DbClass[];

function entry(id: string, held: boolean) {
  return fromAny<DbEntry, unknown>({
    id,
    class_id: 'class-1',
    dog_id: `dog-${id}`,
    entry_status: 'confirmed',
    awaiting_registration_number: held,
    dog: { id: `dog-${id}`, call_name: id, breed: 'Beagle' },
  });
}

describe('ResultLabelsReport entries awaiting a registration number', () => {
  it('prepares labels for the registered dog only', () => {
    render(
      <ResultLabelsReport
        show={{ id: 'show-1', name: 'Show' } as Show}
        trials={trials}
        classes={classes}
        entries={[entry('ok', false), entry('held', true)]}
        scope={{ kind: 'show', showId: 'show-1' }}
        sortOrder="armband"
      />
    );
    expect(prepared.ids).toEqual(['ok']);
  });
});
