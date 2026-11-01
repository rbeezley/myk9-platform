import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import type { SecretaryEntry } from '@/services/database/entries';
import { NationalsLeaderboardView } from './NationalsLeaderboardView';

let nextId = 1;
function entry(over: Record<string, unknown>): SecretaryEntry {
  const armband = over.armband as string;
  return {
    id: `e-${nextId++}`,
    class_id: 'c1',
    entry_status: 'confirmed',
    is_scored: true,
    result_status: 'qualified',
    points_earned: 0,
    search_time_seconds: 0,
    dog_id: `dog-${armband}`,
    dog: { id: `dog-${armband}`, name: `Dog ${armband}`, call_name: `Dog ${armband}` },
    handler_identity: { source: 'entered', name: 'Jane Doe' },
    ...over,
  } as unknown as SecretaryEntry;
}

const rows = [
  { id: 'c1', trialDate: '2026-10-10', releasedAt: '2026-10-10T16:00:00Z' },
  { id: 'c2', trialDate: '2026-10-11', releasedAt: '2026-10-10T16:00:00Z' },
];

function renderBoard(entries: SecretaryEntry[]) {
  render(
    <NationalsLeaderboardView
      showId="show-1"
      entries={entries}
      rows={rows}
      showStartDate="2026-10-10"
      refreshFailed={false}
      onRetry={() => {}}
    />
  );
}

function rowFor(dogName: string) {
  return screen.getByRole('row', { name: new RegExp(dogName) });
}

describe('NationalsLeaderboardView total time (MYK9-1573)', () => {
  it('says how many runs a partial total leaves out, so a smaller time never reads as faster', () => {
    renderBoard([
      entry({ armband: '101', points_earned: 10, search_time_seconds: 60 }),
      entry({ armband: '101', class_id: 'c2', points_earned: 10, search_time_seconds: 60 }),
      entry({ armband: '102', points_earned: 10, search_time_seconds: 30 }),
      entry({ armband: '102', class_id: 'c2', points_earned: 10, search_time_seconds: 0 }),
    ]);

    expect(within(rowFor('Dog 102')).getByText('+ 1 run without a time')).toBeInTheDocument();
    expect(within(rowFor('Dog 101')).queryByText(/without a time/)).not.toBeInTheDocument();
  });

  it('shows a dash, not 0:00.00, for a dog with no recorded time at all', () => {
    renderBoard([entry({ armband: '103', points_earned: 5, search_time_seconds: null })]);

    const row = rowFor('Dog 103');
    expect(within(row).queryByText('0:00.00')).not.toBeInTheDocument();
    expect(within(row).getByTitle('1 run without a time')).toBeInTheDocument();
  });
});
