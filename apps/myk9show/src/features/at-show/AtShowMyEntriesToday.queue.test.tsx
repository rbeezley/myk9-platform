import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AtShowMyEntriesToday } from './AtShowMyEntriesToday';
import type { AtShowEntryDetail } from './myAtShowEntryDetails.helpers';

const mockPlaces = vi.hoisted(() => ({ current: new Map<string, number>() }));
const mockPlaceRequests = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/useMyEntryQueuePlaces', () => ({
  useMyEntryQueuePlaces: (ids: readonly string[]) => {
    mockPlaceRequests(ids);
    return mockPlaces.current;
  },
}));

vi.mock('@/hooks/mutations/useCheckInMutation', () => ({
  useCheckInMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { sync: vi.fn() },
}));

function entry(overrides: Partial<AtShowEntryDetail>): AtShowEntryDetail {
  return {
    entryId: 'entry-1',
    classId: 'class-1',
    dogName: 'Rex',
    armband: '101',
    checkInStatus: 'checked-in',
    className: 'Novice Container',
    expectedStartLabel: '9:00 AM',
    isRevisedStart: false,
    hasRunOrder: true,
    isScored: false,
    resultStatus: null,
    resultTimeSeconds: null,
    selfCheckinState: 'allowed',
    trialLabel: null,
    ...overrides,
  };
}

function renderRow(detail: AtShowEntryDetail) {
  return render(
    <AtShowMyEntriesToday
      showId="show-1"
      entries={[detail]}
      isLoading={false}
      dataUpdatedAt={1}
      loadFailed={false}
      onRetry={vi.fn()}
      onSeeAllClasses={vi.fn()}
    />
  );
}

describe('AtShowMyEntriesToday — place in line (MYK9-992)', () => {
  it('explains a checked-in, unscored dog with no posted order, and keeps View class', () => {
    mockPlaces.current = new Map();
    renderRow(entry({ hasRunOrder: false }));

    expect(screen.getByText(/not posted|position pending/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view class/i })).toBeInTheDocument();
  });

  it('shows the server place for a checked-in, unscored dog in a gapped queue', () => {
    mockPlaces.current = new Map([['entry-1', 3]]);
    renderRow(entry({}));

    expect(screen.getByText('3rd up')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view class/i })).toBeInTheDocument();
    expect(mockPlaceRequests).toHaveBeenLastCalledWith(['entry-1']);
  });

  it('says Waiting, not a place, when an order is posted but the count is unavailable', () => {
    mockPlaces.current = new Map();
    renderRow(entry({}));

    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.queryByText(/\bup$/)).not.toBeInTheDocument();
  });

  it.each([
    ['scored', { isScored: true, checkInStatus: 'completed' as const }],
    ['in-ring', { checkInStatus: 'in-ring' as const }],
    ['pulled', { checkInStatus: 'pulled' as const }],
  ])('keeps a %s dog state-only, with no place and no pending line', (_label, overrides) => {
    mockPlaces.current = new Map([['entry-1', 2]]);
    mockPlaceRequests.mockClear();
    renderRow(entry(overrides));

    expect(screen.queryByText(/\bup$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/not posted|position pending|^Waiting$/i)).not.toBeInTheDocument();
    expect(mockPlaceRequests).toHaveBeenLastCalledWith([]);
  });
});
