import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { WaitListQueue } from '../WaitListQueue';
import type { WaitListEntry } from '@/types/waitlist-types';

const base: WaitListEntry = {
  id: 'w1',
  classId: 'c1',
  className: 'Novice A',
  exhibitorId: 'e1',
  exhibitorName: 'Jane Smith',
  dogId: 'd1',
  dogName: 'Buddy',
  handlerId: null,
  position: 1,
  status: 'waiting',
  offeredAt: null,
  offerExpiresAt: null,
  createdAt: '2026-05-01T10:00:00Z',
};

const entry2: WaitListEntry = {
  ...base,
  id: 'w2',
  exhibitorName: 'Bob Lee',
  dogName: 'Rex',
  position: 2,
};

const offeredEntry: WaitListEntry = {
  ...base,
  id: 'w3',
  status: 'offered',
  offeredAt: '2026-05-01T12:00:00Z',
  offerExpiresAt: new Date(Date.now() + 3_600_000 * 5).toISOString(), // 5h from now
};

describe('WaitListQueue', () => {
  it('renders wait list entries in order', () => {
    render(
      <WaitListQueue
        entries={[base, entry2]}
        pendingEntries={[]}
        onPromote={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Lee')).toBeInTheDocument();
    // positions
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('calls onPromote when Promote button is clicked', async () => {
    const onPromote = vi.fn();
    const user = userEvent.setup();
    render(
      <WaitListQueue
        entries={[base]}
        pendingEntries={[]}
        onPromote={onPromote}
        onRemove={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: /promote/i }));
    expect(onPromote).toHaveBeenCalledWith('w1');
  });

  it('calls onRemove when Remove button is clicked', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <WaitListQueue entries={[base]} pendingEntries={[]} onPromote={vi.fn()} onRemove={onRemove} />
    );
    await user.click(screen.getByRole('button', { name: /remove/i }));
    expect(onRemove).toHaveBeenCalledWith('w1');
  });

  it('shows pending payment section when offered entries exist', () => {
    render(
      <WaitListQueue
        entries={[]}
        pendingEntries={[offeredEntry]}
        onPromote={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByText(/pending payment/i)).toBeInTheDocument();
    expect(screen.getByText(/jane smith/i)).toBeInTheDocument();
    expect(screen.getByText(/left/i)).toBeInTheDocument();
  });

  it('shows empty state when no entries', () => {
    render(
      <WaitListQueue entries={[]} pendingEntries={[]} onPromote={vi.fn()} onRemove={vi.fn()} />
    );
    expect(screen.getByText(/no exhibitors on the wait list/i)).toBeInTheDocument();
  });

  it('disables buttons when isPromoting is true', () => {
    render(
      <WaitListQueue
        entries={[base]}
        pendingEntries={[]}
        onPromote={vi.fn()}
        onRemove={vi.fn()}
        isPromoting
      />
    );
    expect(screen.getByRole('button', { name: /promote/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /remove/i })).toBeDisabled();
  });
});
