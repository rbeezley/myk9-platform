import '@/test/utils/pageRenderWait';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AtShowMyEntriesToday } from './AtShowMyEntriesToday';
import type { AtShowEntryDetail } from './myAtShowEntryDetails.helpers';
import type { QueuePlace } from '@/hooks/queries/useMyEntryQueuePlaces';

const mockPlaces = vi.hoisted(() => ({ current: new Map<string, QueuePlace>() }));
const live = (place: number): QueuePlace => ({ place, claimState: 'live' });
const mockUpdatedAt = vi.hoisted(() => ({ current: 1_761_325_500_000 as number | null }));
const mockPlaceRequests = vi.hoisted(() => vi.fn());

// The ringside menu has its own tests; these render the screen on its own.
vi.mock('./menu/RingsideMenu', () => ({ RingsideMenu: () => null }));

vi.mock('@/hooks/queries/useMyEntryQueuePlaces', () => ({
  useMyEntryQueuePlacesWithFreshness: (ids: readonly string[]) => {
    mockPlaceRequests(ids);
    return { places: mockPlaces.current, updatedAt: mockUpdatedAt.current };
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
    resultFaults: null,
    isPreliminary: false,
    selfCheckinState: 'allowed',
    trialLabel: null,
    trialTimezone: 'America/Chicago',
    ...overrides,
  };
}

function renderRow(detail: AtShowEntryDetail) {
  return render(
    <AtShowMyEntriesToday
      showId="show-1"
      showName="Spring Scent Trial"
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
    mockPlaces.current = new Map([['entry-1', live(3)]]);
    renderRow(entry({}));

    expect(screen.getByText('3rd up')).toBeInTheDocument();
    expect(screen.getByText('updated 12:05 PM')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view class/i })).toBeInTheDocument();
    expect(mockPlaceRequests).toHaveBeenLastCalledWith(['entry-1']);
  });

  it('shows a paper class as its position in the running order, with the paper note', () => {
    mockPlaces.current = new Map([['entry-1', { place: 7, claimState: 'paper' }]]);
    renderRow(entry({}));

    expect(screen.getByText('7th in the running order')).toBeInTheDocument();
    expect(
      screen.getByText('This class is scored on paper. Listen for your number at the ring.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/\bup$|ahead|away/)).not.toBeInTheDocument();
  });

  it('shows the paper line offline from the class this device holds, with no place', () => {
    mockPlaces.current = new Map();
    renderRow(entry({ scoresOnPaper: true }));

    expect(screen.getByText('In the running order')).toBeInTheDocument();
    expect(
      screen.getByText('This class is scored on paper. Listen for your number at the ring.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Waiting')).not.toBeInTheDocument();
  });

  it('says the order may be out of date for a stale claim, never a place', () => {
    mockPlaces.current = new Map([['entry-1', { place: 3, claimState: 'stale' }]]);
    renderRow(entry({}));

    expect(screen.getByText('Order may be out of date')).toBeInTheDocument();
    expect(screen.queryByText('3rd up')).not.toBeInTheDocument();
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
    mockPlaces.current = new Map([['entry-1', live(2)]]);
    mockPlaceRequests.mockClear();
    renderRow(entry(overrides));

    expect(screen.queryByText(/\bup$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/not posted|position pending|^Waiting$/i)).not.toBeInTheDocument();
    expect(mockPlaceRequests).toHaveBeenLastCalledWith([]);
  });

  it.each([
    [1, 'Next up'],
    [12, '12th up'],
  ])('labels place %i with when it was counted, on the trial clock', (place, text) => {
    mockPlaces.current = new Map([['entry-1', live(place)]]);
    renderRow(entry({}));

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByText('updated 12:05 PM')).toBeInTheDocument();
  });

  it('shows no number at all when the place has no timestamp', () => {
    mockPlaces.current = new Map([['entry-1', live(3)]]);
    mockUpdatedAt.current = null;
    try {
      renderRow(entry({}));

      expect(screen.queryByText('3rd up')).not.toBeInTheDocument();
      expect(screen.queryByText(/updated/)).not.toBeInTheDocument();
      expect(screen.getByText('Waiting')).toBeInTheDocument();
    } finally {
      mockUpdatedAt.current = 1_761_325_500_000;
    }
  });
});
