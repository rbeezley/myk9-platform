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
    expectedStartLabel: null,
    isRevisedStart: false,
    hasRunOrder: true,
    isScored: false,
    selfCheckinState: 'allowed',
    trialLabel: null,
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
    const { container } = render(
      <AtShowMyEntriesToday
        showId="show-1"
        entries={[entry({ checkInStatus: status, isScored: status === 'completed' })]}
        isLoading={false}
        dataUpdatedAt={1}
        loadFailed={false}
        onRetry={vi.fn()}
        onSeeAllClasses={vi.fn()}
      />
    );

    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(container.querySelector(`[data-status="${status}"][data-shape]`)).toBeTruthy();
    expect(screen.queryByText('Not checked in yet')).not.toBeInTheDocument();
  });

  it('still shows the plain-language override for statuses that have one', async () => {
    render(
      <AtShowMyEntriesToday
        showId="show-1"
        entries={[entry({ checkInStatus: 'conflict' })]}
        isLoading={false}
        dataUpdatedAt={1}
        loadFailed={false}
        onRetry={vi.fn()}
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
        loadFailed={false}
        onRetry={vi.fn()}
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
        loadFailed={false}
        onRetry={vi.fn()}
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
        loadFailed={false}
        onRetry={vi.fn()}
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
        loadFailed={false}
        onRetry={vi.fn()}
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
        loadFailed={false}
        onRetry={vi.fn()}
        onSeeAllClasses={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('I am not there yet')).toBeInTheDocument();
    });
  });
});

// MYK9-774: a failed device read of this show's entries used to leave an
// exhibitor with "Your entries for this show haven't loaded yet" and nothing to
// do. It now says the device could not read them and offers a retry.
describe('AtShowMyEntriesToday — a failed device read', () => {
  it('says the entries could not be read and retries on request', async () => {
    const onRetry = vi.fn();
    render(
      <AtShowMyEntriesToday
        showId="show-1"
        entries={[]}
        isLoading={false}
        dataUpdatedAt={0}
        loadFailed
        onRetry={onRetry}
        onSeeAllClasses={vi.fn()}
      />
    );

    expect(
      await screen.findByText("We couldn't read your entries on this device.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/haven't loaded yet/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps the last list but marks it out of date when a later read fails', async () => {
    const onRetry = vi.fn();
    render(
      <AtShowMyEntriesToday
        showId="show-1"
        entries={[entry({})]}
        isLoading={false}
        dataUpdatedAt={1}
        loadFailed
        onRetry={onRetry}
        onSeeAllClasses={vi.fn()}
      />
    );

    expect(await screen.findByText(/This may be out of date/)).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(
      screen.queryByText("We couldn't read your entries on this device.")
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

// MYK9-800 follow-up: an owner production walk hit "Check-in failed — ask
// the secretary to check you in" because this page offered Check In for a
// class where self-check-in is off; `self_checkin_entry` refused the write.
describe('AtShowMyEntriesToday — never offers a check-in the server will refuse', () => {
  it('hides the Check in button and explains why when self-check-in is off for the class', async () => {
    render(
      <AtShowMyEntriesToday
        showId="show-1"
        entries={[entry({ selfCheckinState: 'not-allowed' })]}
        isLoading={false}
        dataUpdatedAt={1}
        loadFailed={false}
        onRetry={vi.fn()}
        onSeeAllClasses={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Check in/ })).not.toBeInTheDocument();
    expect(await screen.findByText(/Self check-in is off for this class/)).toBeInTheDocument();
  });

  it('still shows the Check in button when self-check-in is enabled', async () => {
    render(
      <AtShowMyEntriesToday
        showId="show-1"
        entries={[entry({ selfCheckinState: 'allowed' })]}
        isLoading={false}
        dataUpdatedAt={1}
        loadFailed={false}
        onRetry={vi.fn()}
        onSeeAllClasses={vi.fn()}
      />
    );

    expect(await screen.findByRole('button', { name: /Check in/ })).toBeInTheDocument();
  });

  // MYK9-800 follow-up P1 (Codex): an unresolved cascade (batch query error,
  // still loading, or the device is offline — this is a server RPC with no
  // replicated fallback) must show the same calm, non-actionable state as a
  // known 'not-allowed' class, never fall open to a tappable Check In.
  it('hides the Check in button and shows a calm message when self-check-in is unresolved', async () => {
    render(
      <AtShowMyEntriesToday
        showId="show-1"
        entries={[entry({ selfCheckinState: 'unknown' })]}
        isLoading={false}
        dataUpdatedAt={1}
        loadFailed={false}
        onRetry={vi.fn()}
        onSeeAllClasses={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Check in/ })).not.toBeInTheDocument();
    expect(
      await screen.findByText(/Check-in isn't available right now\. Ask at the show desk\./)
    ).toBeInTheDocument();
  });
});

// MYK9-800 walk finding #2: the owner asked for the trial date and trial
// number alongside element/level/section so a multi-day show's rows are
// unambiguous.
describe('AtShowMyEntriesToday — row shows trial context (MYK9-800 finding #2)', () => {
  it("renders the trial's label ahead of the class name when it's known", async () => {
    render(
      <AtShowMyEntriesToday
        showId="show-1"
        entries={[entry({ trialLabel: 'Trial 2 · Sun, Sep 27' })]}
        isLoading={false}
        dataUpdatedAt={1}
        loadFailed={false}
        onRetry={vi.fn()}
        onSeeAllClasses={vi.fn()}
      />
    );

    expect(await screen.findByText('Trial 2 · Sun, Sep 27 · Novice Container')).toBeInTheDocument();
  });

  it('falls back to just the class name when the trial label is not known yet', async () => {
    render(
      <AtShowMyEntriesToday
        showId="show-1"
        entries={[entry({ trialLabel: null })]}
        isLoading={false}
        dataUpdatedAt={1}
        loadFailed={false}
        onRetry={vi.fn()}
        onSeeAllClasses={vi.fn()}
      />
    );

    expect(await screen.findByText('Novice Container')).toBeInTheDocument();
  });
});

// MYK9-800 walk finding #3: the owner had no way back to the exhibitor
// dashboard from this show-day page.
describe('AtShowMyEntriesToday — back navigation (MYK9-800 finding #3)', () => {
  it('offers a link back to the dashboard', async () => {
    render(
      <AtShowMyEntriesToday
        showId="show-1"
        entries={[entry({})]}
        isLoading={false}
        dataUpdatedAt={1}
        loadFailed={false}
        onRetry={vi.fn()}
        onSeeAllClasses={vi.fn()}
      />
    );

    const backLink = await screen.findByRole('link', { name: /Back to dashboard/ });
    expect(backLink).toHaveAttribute('href', '/');
  });
});
