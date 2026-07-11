import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AtShowMyEntriesToday } from './AtShowMyEntriesToday';
import type { AtShowEntryDetail } from './myAtShowEntryDetails.helpers';

const mockMutateAsync = vi.hoisted(() => vi.fn());
const mockSync = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/mutations/useCheckInMutation', () => ({
  useCheckInMutation: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { sync: mockSync },
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
  beforeEach(() => {
    mockMutateAsync.mockReset();
  });

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
        dataUpdatedAt={1}
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
        dataUpdatedAt={1}
        onSeeAllClasses={vi.fn()}
      />
    );

    expect(await screen.findByText('I have a conflict — tell the secretary')).toBeInTheDocument();
  });
});

describe('AtShowMyEntriesToday — check-in gives visible feedback', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset();
    mockSync.mockReset();
    mockSync.mockResolvedValue(undefined);
  });

  it("pulls this show's rows back down after a successful check-in — the RPC write never reaches replicatedEntriesTable any other way, so the subscription would otherwise have nothing real to reconcile against", async () => {
    mockMutateAsync.mockResolvedValue(undefined);
    render(
      <AtShowMyEntriesToday
        showId="show-1"
        entries={[entry({ checkInStatus: 'no-status' })]}
        isLoading={false}
        dataUpdatedAt={1}
        onSeeAllClasses={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Check in/ }));

    await waitFor(() => {
      expect(mockSync).toHaveBeenCalledWith('show-1');
    });
  });

  it('flips the badge to "I am here" and hides the Check in button immediately on tap', async () => {
    mockMutateAsync.mockResolvedValue(undefined);
    render(
      <AtShowMyEntriesToday
        showId="show-1"
        entries={[entry({ checkInStatus: 'no-status' })]}
        isLoading={false}
        dataUpdatedAt={1}
        onSeeAllClasses={vi.fn()}
      />
    );

    expect(screen.getByText('I am not there yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Check in/ }));

    await waitFor(() => {
      expect(screen.getByText('I am here')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Check in/ })).not.toBeInTheDocument();
  });

  it('rolls back the optimistic update if the check-in RPC fails', async () => {
    mockMutateAsync.mockRejectedValue(new Error('offline'));
    render(
      <AtShowMyEntriesToday
        showId="show-1"
        entries={[entry({ checkInStatus: 'no-status' })]}
        isLoading={false}
        dataUpdatedAt={1}
        onSeeAllClasses={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Check in/ }));

    await waitFor(() => {
      expect(screen.getByText('I am not there yet')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Check in/ })).toBeInTheDocument();
  });

  it('defers to fresh authoritative data once it arrives, even from another surface', async () => {
    mockMutateAsync.mockResolvedValue(undefined);
    const { rerender } = render(
      <AtShowMyEntriesToday
        showId="show-1"
        entries={[entry({ checkInStatus: 'no-status' })]}
        isLoading={false}
        dataUpdatedAt={1}
        onSeeAllClasses={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Check in/ }));
    await waitFor(() => {
      expect(screen.getByText('I am here')).toBeInTheDocument();
    });

    // A fresh fetch lands (dataUpdatedAt changed) showing the secretary
    // reverted the exhibitor back to not-checked-in — the stale optimistic
    // "I am here" must not linger.
    rerender(
      <AtShowMyEntriesToday
        showId="show-1"
        entries={[entry({ checkInStatus: 'no-status' })]}
        isLoading={false}
        dataUpdatedAt={2}
        onSeeAllClasses={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('I am not there yet')).toBeInTheDocument();
    });
  });
});
