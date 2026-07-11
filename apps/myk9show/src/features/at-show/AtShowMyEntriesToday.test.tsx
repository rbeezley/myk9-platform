import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AtShowMyEntriesToday } from './AtShowMyEntriesToday';
import type { AtShowEntryDetail } from './myAtShowEntryDetails.helpers';

vi.mock('@/hooks/mutations/useCheckInMutation', () => ({
  useCheckInMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function entry(overrides: Partial<AtShowEntryDetail>): AtShowEntryDetail {
  return {
    entryId: 'entry-1',
    classId: 'class-1',
    dogName: 'Rex',
    armband: '101',
    checkInStatus: 'no-status',
    className: 'Novice Container',
    hasRunOrder: true,
    isScored: false,
    ...overrides,
  };
}

describe('AtShowMyEntriesToday — status badge falls back to the staff-grade label', () => {
  it.each([
    ['at-gate', 'At Gate'],
    ['come-to-gate', 'Come to Gate'],
    ['in-ring', 'In Ring'],
    ['completed', 'Completed'],
  ] as const)('shows "%s" as "%s", not a misleading "not checked in"', async (status, label) => {
    render(
      <AtShowMyEntriesToday
        showId="show-1"
        entries={[entry({ checkInStatus: status, isScored: status === 'completed' })]}
        isLoading={false}
        onSeeAllClasses={vi.fn()}
      />
    );

    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.queryByText('Not checked in yet')).not.toBeInTheDocument();
  });

  it('still shows the plain-language override for statuses that have one', async () => {
    render(
      <AtShowMyEntriesToday
        showId="show-1"
        entries={[entry({ checkInStatus: 'conflict' })]}
        isLoading={false}
        onSeeAllClasses={vi.fn()}
      />
    );

    expect(await screen.findByText('I have a conflict — tell the secretary')).toBeInTheDocument();
  });
});
